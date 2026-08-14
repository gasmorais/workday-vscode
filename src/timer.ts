import * as vscode from "vscode";
import { formatDuration } from "./time.js";
import { t } from "./strings.js";
import type { Id } from "./types.js";

const STATE_KEY = "proofhub.runningTimer";

export interface RunningTimer {
  projectId: Id;
  todolistId: Id;
  taskId: Id;
  title: string;
  startedAt: number;
}

export class Timer {
  private readonly item: vscode.StatusBarItem;
  private ticker: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = "proofhub.stopTimer";
    context.subscriptions.push(this.item, { dispose: () => this.clearTicker() });
    this.render();
  }

  get running(): RunningTimer | undefined {
    return this.context.globalState.get<RunningTimer>(STATE_KEY);
  }

  async start(timer: RunningTimer): Promise<void> {
    await this.context.globalState.update(STATE_KEY, timer);
    this.render();
  }

  async stop(): Promise<RunningTimer | undefined> {
    const running = this.running;
    await this.context.globalState.update(STATE_KEY, undefined);
    this.render();
    return running;
  }

  private render(): void {
    const running = this.running;
    this.clearTicker();
    if (!running) {
      this.item.hide();
      return;
    }
    const paint = () => {
      const elapsed = formatDuration(Date.now() - running.startedAt);
      this.item.text = `$(watch) ${elapsed}  ${running.title}`;
      this.item.tooltip = t.time.stopHint;
      this.item.show();
    };
    paint();
    this.ticker = setInterval(paint, 30_000);
  }

  private clearTicker(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = undefined;
    }
  }
}
