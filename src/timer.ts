import * as vscode from "vscode";
import { formatDuration } from "./time.js";
import { t } from "./strings.js";
import { sameId, type Id } from "./types.js";

const STATE_KEY = "proofhub.runningTimers";

export interface RunningTimer {
  projectId: Id;
  todolistId: Id;
  taskId: Id;
  parentTaskId?: Id;
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

  get all(): RunningTimer[] {
    return this.context.globalState.get<RunningTimer[]>(STATE_KEY) ?? [];
  }

  on(taskId: Id): RunningTimer | undefined {
    return this.all.find((timer) => sameId(timer.taskId, taskId));
  }

  async start(timer: RunningTimer): Promise<boolean> {
    if (this.on(timer.taskId)) {
      return false;
    }
    await this.write([...this.all, timer]);
    return true;
  }

  async stop(taskId: Id): Promise<RunningTimer | undefined> {
    const running = this.on(taskId);
    if (!running) {
      return undefined;
    }
    await this.write(this.all.filter((timer) => !sameId(timer.taskId, taskId)));
    return running;
  }

  private async write(timers: RunningTimer[]): Promise<void> {
    await this.context.globalState.update(STATE_KEY, timers);
    this.render();
  }

  private render(): void {
    this.clearTicker();
    const paint = () => {
      const running = this.all;
      if (running.length === 0) {
        this.item.hide();
        return;
      }
      const newest = running.reduce((left, right) =>
        left.startedAt >= right.startedAt ? left : right,
      );
      const elapsed = formatDuration(Date.now() - newest.startedAt);
      const badge = running.length > 1 ? `  +${running.length - 1}` : "";
      this.item.text = `$(watch) ${elapsed}  ${newest.title}${badge}`;
      const tooltip = new vscode.MarkdownString();
      for (const timer of running) {
        tooltip.appendMarkdown(
          `- ${t.time.running(timer.title, formatDuration(Date.now() - timer.startedAt))}\n`,
        );
      }
      tooltip.appendMarkdown(
        `\n${running.length > 1 ? t.time.stopHintMany(running.length) : t.time.stopHint}`,
      );
      this.item.tooltip = tooltip;
      this.item.show();
    };
    paint();
    if (this.all.length > 0) {
      this.ticker = setInterval(paint, 30_000);
    }
  }

  private clearTicker(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = undefined;
    }
  }
}
