import * as vscode from "vscode";
import { describeFailure, type Session } from "./auth.js";
import { page } from "./components/shell.js";
import { renderReport } from "./components/report-view.js";
import { parseHours } from "./format.js";
import { buildReport, type Logged } from "./report.js";
import { t } from "./locales/index.js";
import { estimateOf, sameId, type Person } from "./types.js";
import { CONFIG_SECTION } from "./constants.js";

export class ReportPanel {
  private panel: vscode.WebviewPanel | undefined;
  private onlyMine = true;

  constructor(
    private readonly session: () => Session | undefined,
    private readonly whoAmI: () => Promise<Person | undefined>,
  ) {}

  async show(): Promise<void> {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "proofhub.report",
        t.report.title,
        { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
        { enableScripts: true, retainContextWhenHidden: true },
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
      this.panel.webview.onDidReceiveMessage(async (message: { act?: string }) => {
        if (message.act === "toggleMine") {
          this.onlyMine = !this.onlyMine;
        }
        await this.load();
      });
    }
    this.panel.reveal();
    await this.load();
  }

  private async load(): Promise<void> {
    const session = this.session();
    if (!session || !this.panel) {
      return;
    }
    this.panel.webview.html = page(`<p class="empty">${t.report.loading}</p>`);
    try {
      const data = await this.collect(session);
      if (!data) {
        return;
      }
      const goal = parseHours(
        vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>("dailyGoal", "8:00"),
      );
      this.panel.webview.html = page(
        renderReport(buildReport(data.entries, { estimatedOpenMinutes: data.estimated }), {
          onlyMine: this.onlyMine,
          goalMinutes: goal,
        }),
      );
    } catch (error) {
      this.panel.webview.html = page(
        `<p class="empty">${describeFailure(error)}</p><p class="actions"><button data-act="refresh">${t.common.tryAgain}</button></p>`,
      );
    }
  }

  private async collect(
    session: Session,
  ): Promise<{ entries: Logged[]; estimated: number } | undefined> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t.report.loading,
        cancellable: true,
      },
      async (progress, token) => {
        const { client } = session;
        const me = await this.whoAmI();
        const projects = await client.projects(false);
        const entries: Logged[] = [];
        let estimated = 0;

        for (const [index, project] of projects.entries()) {
          if (token.isCancellationRequested) {
            break;
          }
          progress.report({
            message: t.mine.progress(project.title, index + 1, projects.length),
            increment: 100 / Math.max(projects.length, 1),
          });

          for (const sheet of await client.timesheets(project.id).catch(() => [])) {
            for (const entry of await client.timeEntries(project.id, sheet.id).catch(() => [])) {
              const mine = me ? sameId(entry.creator?.id, me.id) : Boolean(entry.by_me);
              if (this.onlyMine && !mine) {
                continue;
              }
              entries.push({ ...entry, projectTitle: project.title });
            }
          }

          for (const todolist of await client.todolists(project.id).catch(() => [])) {
            if (token.isCancellationRequested) {
              break;
            }
            for (const task of await client.tasks(project.id, todolist.id).catch(() => [])) {
              const mine = me
                ? (task.assigned ?? []).some((id) => sameId(id, me.id))
                : Boolean(task.by_me);
              if (task.completed || (this.onlyMine && !mine)) {
                continue;
              }
              estimated += estimateOf(task);
            }
          }
        }
        return { entries, estimated };
      },
    );
  }
}
