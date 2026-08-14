import * as vscode from "vscode";
import { describeFailure, type Session } from "./auth.js";
import { page } from "./components/shell.js";
import { renderReport } from "./components/report-view.js";
import { parseHours } from "./format.js";
import { buildReport, type Grain, type Logged } from "./report.js";
import { t } from "./locales/index.js";
import { estimateOf, personName, sameId, type Id, type Person } from "./types.js";
import { CONFIG_SECTION } from "./constants.js";

export class ReportPanel {
  private panel: vscode.WebviewPanel | undefined;
  private chosen: Id[] | undefined;
  private onlyMine = true;
  private grain: Grain = "day";

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
        const act = message.act ?? "";
        if (act === "mine") {
          this.onlyMine = true;
          this.chosen = undefined;
        } else if (act === "everyone") {
          this.onlyMine = false;
          this.chosen = undefined;
        } else if (act === "people") {
          if (!(await this.pickPeople())) {
            return;
          }
        } else if (act.startsWith("grain:")) {
          this.grain = act.slice(6) as Grain;
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
        renderReport(
          buildReport(data.entries, { estimatedOpenMinutes: data.estimated, grain: this.grain }),
          { scope: this.scopeLabel(), goalMinutes: goal },
        ),
      );
    } catch (error) {
      this.panel.webview.html = page(
        `<p class="empty">${describeFailure(error)}</p><p class="actions"><button data-act="refresh">${t.common.tryAgain}</button></p>`,
      );
    }
  }

  private scopeLabel(): string {
    if (this.chosen && this.chosen.length > 0) {
      return t.report.scopeSome(this.chosenNames.join(", "));
    }
    return this.onlyMine ? t.report.scopeMine : t.report.scopeEveryone;
  }

  private async pickPeople(): Promise<boolean> {
    const session = this.session();
    if (!session) {
      return false;
    }
    const people = await session.client.people().catch(() => [] as Person[]);
    const picked = await vscode.window.showQuickPick(
      people
        .filter((person) => !person.suspended)
        .map((person) => ({
          label: personName(person),
          description: person.email,
          picked: Boolean(this.chosen?.some((id) => sameId(id, person.id))),
          person,
        })),
      {
        title: t.report.pickPeople,
        placeHolder: t.report.pickPeopleHint,
        canPickMany: true,
        ignoreFocusOut: true,
      },
    );
    if (!picked) {
      return false;
    }
    this.chosen = picked.map((item) => item.person.id);
    this.chosenNames = picked.map((item) => item.label);
    this.onlyMine = false;
    return true;
  }

  private chosenNames: string[] = [];

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
        const people = await client.people().catch(() => [] as Person[]);
        const names = new Map(people.map((person) => [String(person.id), personName(person)]));
        const wanted = this.chosen && this.chosen.length > 0 ? this.chosen : undefined;
        const keep = (id: Id | undefined, fallback: boolean): boolean => {
          if (wanted) {
            return id !== undefined && wanted.some((chosen) => sameId(chosen, id));
          }
          if (!this.onlyMine) {
            return true;
          }
          return me ? sameId(id, me.id) : fallback;
        };
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
              if (!keep(entry.creator?.id, Boolean(entry.by_me))) {
                continue;
              }
              entries.push({
                ...entry,
                projectTitle: project.title,
                authorName: names.get(String(entry.creator?.id)) ?? t.detail.someone,
              });
            }
          }

          for (const todolist of await client.todolists(project.id).catch(() => [])) {
            if (token.isCancellationRequested) {
              break;
            }
            for (const task of await client.tasks(project.id, todolist.id).catch(() => [])) {
              const owners = task.assigned ?? [];
              const wantedTask =
                wanted || this.onlyMine ? owners.some((id) => keep(id, Boolean(task.by_me))) : true;
              if (task.completed || !wantedTask) {
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
