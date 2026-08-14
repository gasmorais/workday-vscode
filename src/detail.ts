import * as vscode from "vscode";
import { describeFailure, type Session } from "./auth.js";
import { renderBody, type TaskView } from "./components/sections.js";
import { t } from "./strings.js";
import { page } from "./components/shell.js";

async function settle<T>(promise: Promise<T>): Promise<{ value?: T; error?: string }> {
  try {
    return { value: await promise };
  } catch (error) {
    return { error: describeFailure(error) };
  }
}
import type { Node } from "./tree.js";
import { personName, sameId, type Id, type Person, type TimeEntry } from "./types.js";
import { today } from "./time.js";
import { parseHours } from "./format.js";

export interface DetailHost {
  session: () => Session | undefined;
  onChanged: (node: Node) => void;
  startTimer: (node: Node) => Thenable<void>;
  stopTimer: () => Thenable<void>;
  timerRunsOn: (taskId: Id) => boolean;
  openInBrowser: (node: Node) => Thenable<void>;
}

export class TaskDetail {
  private panel: vscode.WebviewPanel | undefined;
  private node: Node | undefined;
  private people: Map<string, string> | undefined;

  constructor(private readonly host: DetailHost) {}

  async show(node: Node): Promise<void> {
    if (node.kind !== "task") {
      return;
    }
    this.node = node;
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "proofhub.task",
        node.task.title,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true },
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.node = undefined;
      });
      this.panel.webview.onDidReceiveMessage((message) => this.handle(message));
    }
    this.panel.title = node.task.title;
    this.panel.reveal(vscode.ViewColumn.Beside, true);
    await this.load();
  }

  get taskId(): Id | undefined {
    return this.node?.kind === "task" ? this.node.task.id : undefined;
  }

  refreshIfShowing(taskId: Id): void {
    if (this.node?.kind === "task" && sameId(this.node.task.id, taskId)) {
      void this.load();
    }
  }

  private async load(): Promise<void> {
    const session = this.host.session();
    const node = this.node;
    if (!session || !this.panel || node?.kind !== "task") {
      return;
    }
    const { client } = session;
    const { project, todolist, task } = node;
    this.panel.webview.html = this.shell(`<p class="empty">${t.common.loading}</p>`);

    try {
      const [fresh, subtasks, comments, time] = await Promise.all([
        settle(client.task(project.id, todolist.id, task.id)),
        settle(client.subtasks(project.id, todolist.id, task.id)),
        settle(client.comments(project.id, todolist.id, task.id)),
        settle(this.taskTime(session, project.id, task.id)),
      ]);
      this.node = { ...node, task: { ...task, ...(fresh.value ?? {}) } };
      const names = await this.names(session);
      const view: TaskView = {
        projectTitle: project.title,
        todolistTitle: todolist.title,
        task: this.node.task,
        assignees: (this.node.task.assigned ?? []).map((id) => names.get(String(id)) ?? String(id)),
        subtasks: subtasks.value ?? [],
        comments: (comments.value ?? []).map((comment) => ({
          ...comment,
          authorName: names.get(String(comment.creator?.id)),
        })),
        time: time.value ?? [],
        timerRunning: this.host.timerRunsOn(task.id),
        problems: {
          subtasks: subtasks.error,
          comments: comments.error,
          time: time.error,
        },
      };
      this.panel.webview.html = this.shell(renderBody(view));
    } catch (error) {
      this.panel.webview.html = this.shell(
        `<p class="empty">${describeFailure(error)}</p><p class="actions"><button data-act="refresh">${t.common.tryAgain}</button></p>`,
      );
    }
  }

  private async names(session: Session): Promise<Map<string, string>> {
    if (!this.people) {
      const list: Person[] = await session.client.people().catch(() => []);
      this.people = new Map(list.map((person) => [String(person.id), personName(person)]));
    }
    return this.people;
  }

  private async taskTime(session: Session, projectId: Id, taskId: Id): Promise<TimeEntry[]> {
    const sheets = await session.client.timesheets(projectId).catch(() => []);
    const pages = await Promise.all(
      sheets.map((sheet) => session.client.timeEntries(projectId, sheet.id).catch(() => [])),
    );
    return pages.flat().filter((entry) => sameId(entry.task?.id, taskId));
  }

  private async handle(message: { act?: string; id?: string; value?: unknown }): Promise<void> {
    const session = this.host.session();
    const node = this.node;
    if (!session || node?.kind !== "task") {
      return;
    }
    const { client } = session;
    const { project, todolist, task } = node;
    const fields = (message.value ?? {}) as Record<string, string>;

    try {
      switch (message.act) {
        case "refresh":
          await this.load();
          return;
        case "open":
          await this.host.openInBrowser(node);
          return;
        case "startTimer":
          await this.host.startTimer(node);
          break;
        case "stopTimer":
          await this.host.stopTimer();
          break;
        case "complete":
        case "reopen":
          await client.updateTask(project.id, todolist.id, task.id, {
            completed: message.act === "complete",
          });
          break;
        case "toggleSubtask":
          await client.updateSubtask(project.id, todolist.id, task.id, String(message.id), {
            completed: Boolean(message.value),
          });
          break;
        case "subtask": {
          const title = fields.title?.trim();
          if (!title) {
            return;
          }
          await client.createSubtask(project.id, todolist.id, task.id, { title });
          break;
        }
        case "comment": {
          const content = fields.content?.trim();
          if (!content) {
            return;
          }
          await client.addComment(project.id, todolist.id, task.id, content);
          break;
        }
        case "time": {
          const hours = fields.hours?.trim();
          if (!hours || !/^\d{1,3}:[0-5]\d$/.test(hours)) {
            vscode.window.showWarningMessage(t.time.hoursInvalid);
            return;
          }
          const sheets = await client.timesheets(project.id);
          if (sheets.length === 0) {
            vscode.window.showWarningMessage(t.time.noTimesheet);
            return;
          }
          const minutes = parseHours(hours);
          await client.logTime({
            project: project.id,
            timesheet_id: sheets[0].id,
            date: today(),
            logged_hours: String(Math.floor(minutes / 60)),
            logged_mins: String(minutes % 60),
            description: fields.description?.trim() ?? "",
            list_id: todolist.id,
            task_id: task.id,
          });
          break;
        }
        default:
          return;
      }
      this.host.onChanged(node);
      await this.load();
    } catch (error) {
      vscode.window.showErrorMessage(describeFailure(error));
      await this.load();
    }
  }

  private shell(body: string): string {
    return page(body);
  }
}

