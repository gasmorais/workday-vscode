import { execFile } from "node:child_process";
import * as vscode from "vscode";
import { CONFIG_SECTION, MAC_POLL_SECONDS } from "../constants.js";
import { t } from "../locales/index.js";
import { CALL_WINDOW_PATTERN, parseWindowList, readWindows } from "./mac-windows.js";

const SCRIPT = `tell application "System Events"
  if not (exists process "Microsoft Teams") then return ""
  tell process "Microsoft Teams"
    set AppleScript's text item delimiters to (ASCII character 31)
    return (name of every window) as text
  end tell
end tell`;

function run(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", SCRIPT], { timeout: 5_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

export class MacCallWatcher {
  private timer: ReturnType<typeof setInterval> | undefined;
  private warned = false;
  private readonly emitter = new vscode.EventEmitter<{ inCall: boolean; title?: string }>();
  private readonly failures = new vscode.EventEmitter<string>();

  readonly onCall = this.emitter.event;
  readonly onProblem = this.failures.event;

  get running(): boolean {
    return Boolean(this.timer);
  }

  start(): void {
    if (this.timer) {
      return;
    }
    const seconds = vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .get<number>("teams.macPollSeconds", MAC_POLL_SECONDS);
    this.timer = setInterval(() => void this.tick(), Math.max(seconds, 2) * 1000);
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  dispose(): void {
    this.stop();
    this.emitter.dispose();
    this.failures.dispose();
  }

  private async tick(): Promise<void> {
    let output: string;
    try {
      output = await run();
    } catch (error) {
      if (!this.warned) {
        this.warned = true;
        this.failures.fire(t.teams.macDenied(error instanceof Error ? error.message : ""));
      }
      return;
    }
    this.warned = false;
    const pattern =
      vscode.workspace
        .getConfiguration(CONFIG_SECTION)
        .get<string>("teams.callWindowPattern")
        ?.trim() || CALL_WINDOW_PATTERN;
    const names = parseWindowList(output.trim());
    this.emitter.fire(readWindows(names, pattern));
  }
}
