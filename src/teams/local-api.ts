import * as vscode from "vscode";
import WebSocket from "ws";
import {
  CONFIG_SECTION,
  SECRET_TEAMS_LOCAL,
  TEAMS_LOCAL_PORT,
  TEAMS_LOCAL_PROTOCOL,
  TEAMS_RECONNECT_MS,
} from "../constants.js";
import type { MeetingState } from "./call-tracker.js";

interface Envelope {
  meetingUpdate?: { meetingState?: MeetingState };
  tokenRefresh?: string;
  errorMsg?: string;
}

export class TeamsLocalApi {
  private socket: WebSocket | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;
  private readonly emitter = new vscode.EventEmitter<MeetingState>();
  private readonly failures = new vscode.EventEmitter<string>();

  readonly onMeeting = this.emitter.event;
  readonly onProblem = this.failures.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.socket?.close();
    this.socket = undefined;
  }

  dispose(): void {
    this.stop();
    this.emitter.dispose();
    this.failures.dispose();
  }

  private async url(): Promise<string> {
    const settings = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const port = settings.get<number>("teams.localPort", TEAMS_LOCAL_PORT);
    const token = await this.context.secrets.get(SECRET_TEAMS_LOCAL);
    const query = new URLSearchParams({
      "protocol-version": TEAMS_LOCAL_PROTOCOL,
      manufacturer: "ProofHub for VS Code",
      device: "VS Code",
      app: "ProofHub",
      "app-version": "0.1.0",
    });
    if (token) {
      query.set("token", token);
    }
    return `ws://127.0.0.1:${port}?${query.toString()}`;
  }

  private async open(): Promise<void> {
    if (this.stopped || this.connected) {
      return;
    }
    const socket = new WebSocket(await this.url());
    this.socket = socket;

    socket.on("message", (raw) => {
      let payload: Envelope;
      try {
        payload = JSON.parse(String(raw)) as Envelope;
      } catch {
        return;
      }
      if (payload.tokenRefresh) {
        void this.context.secrets.store(SECRET_TEAMS_LOCAL, payload.tokenRefresh);
      }
      if (payload.errorMsg) {
        this.failures.fire(payload.errorMsg);
      }
      if (payload.meetingUpdate?.meetingState) {
        this.emitter.fire(payload.meetingUpdate.meetingState);
      }
    });

    socket.on("close", () => {
      this.socket = undefined;
      this.retry();
    });

    socket.on("error", () => {
      this.socket = undefined;
    });
  }

  private retry(): void {
    if (this.stopped || this.timer) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.open();
    }, TEAMS_RECONNECT_MS);
  }
}
