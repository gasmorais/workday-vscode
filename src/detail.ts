import * as vscode from "vscode";
import { describeFailure, type Session } from "./auth.js";
import { renderBody, type TaskView } from "./render.js";
import type { Node } from "./tree.js";
import { personName, type Person, type TimeEntry } from "./types.js";
import { today } from "./time.js";

export interface DetailHost {
  session: () => Session | undefined;
  onChanged: (node: Node) => void;
  startTimer: (node: Node) => Thenable<void>;
  stopTimer: () => Thenable<void>;
  timerRunsOn: (taskId: string) => boolean;
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

  get taskId(): string | undefined {
    return this.node?.kind === "task" ? this.node.task.id : undefined;
  }

  refreshIfShowing(taskId: string): void {
    if (this.node?.kind === "task" && this.node.task.id === taskId) {
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
    this.panel.webview.html = this.shell("<p class=\"empty\">Loading…</p>");

    try {
      const [fresh, subtasks, comments, time] = await Promise.all([
        client.task(project.id, todolist.id, task.id).catch(() => task),
        client.subtasks(project.id, todolist.id, task.id).catch(() => []),
        client.comments(project.id, todolist.id, task.id).catch(() => []),
        this.taskTime(session, project.id, task.id),
      ]);
      this.node = { ...node, task: { ...task, ...fresh } };
      const names = await this.names(session);
      const view: TaskView = {
        projectTitle: project.title,
        todolistTitle: todolist.title,
        task: this.node.task,
        assignees: (this.node.task.assigned ?? []).map((id) => names.get(String(id)) ?? String(id)),
        subtasks,
        comments: comments.map((comment) => ({
          ...comment,
          authorName: names.get(String(comment.created_by)) ?? comment.created_by,
        })),
        time,
        timerRunning: this.host.timerRunsOn(task.id),
      };
      this.panel.webview.html = this.shell(renderBody(view));
    } catch (error) {
      this.panel.webview.html = this.shell(
        `<p class="empty">${describeFailure(error)}</p><p class="actions"><button data-act="refresh">Try again</button></p>`,
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

  private async taskTime(
    session: Session,
    projectId: string,
    taskId: string,
  ): Promise<TimeEntry[]> {
    const sheets = await session.client.timesheets(projectId).catch(() => []);
    const pages = await Promise.all(
      sheets.map((sheet) => session.client.timeEntries(projectId, sheet.id).catch(() => [])),
    );
    return pages
      .flat()
      .filter((entry) => !entry.task_id || String(entry.task_id) === String(taskId));
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
            vscode.window.showWarningMessage("Use H:MM for the hours.");
            return;
          }
          const sheets = await client.timesheets(project.id);
          if (sheets.length === 0) {
            vscode.window.showWarningMessage("This project has no timesheet to log time into.");
            return;
          }
          await client.logTime(project.id, sheets[0].id, {
            hours,
            description: fields.description?.trim() ?? "",
            logged_date: today(),
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
    const nonce = String(Date.now()) + String(process.hrtime.bigint());
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>${STYLE}</style></head><body>${body}
<script nonce="${nonce}">${SCRIPT}</script></body></html>`;
  }
}

const STYLE = `
body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 0 16px 32px; }
h1 { font-size: 1.35em; margin: 4px 0 8px; }
h1.done { text-decoration: line-through; opacity: .65; }
h2 { font-size: .85em; text-transform: uppercase; letter-spacing: .07em; opacity: .7; margin: 22px 0 8px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
.crumbs { opacity: .65; margin: 12px 0 0; font-size: .9em; }
.chip { display: inline-block; padding: 1px 7px; border-radius: 9px; font-size: .8em; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
.chip.ok { background: var(--vscode-testing-iconPassed); color: var(--vscode-editor-background); }
.count { opacity: .8; font-weight: normal; }
.meta { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin: 6px 0; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0 0; }
button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 11px; border-radius: 2px; cursor: pointer; }
button:hover { background: var(--vscode-button-hoverBackground); }
input, textarea { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); padding: 4px 6px; border-radius: 2px; font-family: inherit; font-size: inherit; }
form { display: flex; gap: 6px; margin-top: 10px; align-items: flex-start; }
form input[name=title], form input[name=description], form textarea { flex: 1; }
.list { list-style: none; margin: 0; padding: 0; }
.list li { padding: 6px 0; border-bottom: 1px solid var(--vscode-panel-border); display: flex; gap: 8px; align-items: baseline; }
.list li span.done { text-decoration: line-through; opacity: .65; }
.list label { display: flex; gap: 8px; align-items: baseline; flex: 1; cursor: pointer; }
.list.comments li { display: block; }
.who { margin: 0 0 3px; font-weight: 600; font-size: .9em; }
.hours { font-variant-numeric: tabular-nums; min-width: 48px; }
.prose { white-space: normal; line-height: 1.5; }
.empty { opacity: .6; font-style: italic; margin: 6px 0; }
`;

const SCRIPT = `
const vs = acquireVsCodeApi();
document.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-act]');
  if (button) { vs.postMessage({ act: button.dataset.act }); }
});
document.addEventListener('change', (e) => {
  const box = e.target.closest('input[data-subtask]');
  if (box) { vs.postMessage({ act: 'toggleSubtask', id: box.dataset.subtask, value: box.checked }); }
});
document.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const value = Object.fromEntries(new FormData(form).entries());
  vs.postMessage({ act: form.dataset.form, value });
});
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    const form = e.target.closest('form');
    if (form) { form.requestSubmit(); }
  }
});
`;
