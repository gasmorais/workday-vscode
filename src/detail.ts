import * as vscode from "vscode";
import { describeFailure, type Session } from "./auth.js";
import { renderBody, type TaskView } from "./components/sections.js";
import { page } from "./components/shell.js";
import { parseHours } from "./format.js";
import { t } from "./locales/index.js";
import { today } from "./time.js";
import type { Node } from "./tree.js";
import {
  entryTargets,
  personName,
  sameId,
  type Id,
  type Person,
  type Subtask,
  type TimeEntry,
} from "./types.js";
import type { LoggedEntry } from "./components/sections.js";
import { HOURS_PATTERN } from "./constants.js";

export interface TimerTarget {
  projectId: Id;
  todolistId: Id;
  taskId: Id;
  parentTaskId?: Id;
  title: string;
}

export interface DetailHost {
  session: () => Session | undefined;
  onChanged: (node: Node) => void;
  startTimer: (target: TimerTarget) => Promise<void>;
  stopTimer: (taskId: Id) => Promise<void>;
  timerRunsOn: (taskId: Id) => boolean;
  timerStartedAt: (taskId: Id) => number | undefined;
  openInBrowser: (node: Node) => Thenable<void>;
  myName: () => Promise<string | undefined>;
}

async function settle<T>(promise: Promise<T>): Promise<{ value?: T; error?: string }> {
  try {
    return { value: await promise };
  } catch (error) {
    return { error: describeFailure(error) };
  }
}

export class TaskDetail {
  private panel: vscode.WebviewPanel | undefined;
  private node: Node | undefined;
  private focused: Subtask | undefined;
  private people: Map<string, string> | undefined;
  private view: TaskView | undefined;
  private myName: string | undefined;
  private loadToken = 0;

  constructor(private readonly host: DetailHost) {}

  async show(node: Node): Promise<void> {
    if (node.kind !== "task") {
      return;
    }
    this.node = node;
    this.focused = undefined;
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
        this.focused = undefined;
      });
      this.panel.webview.onDidReceiveMessage((message) => this.handle(message));
    }
    this.panel.reveal(vscode.ViewColumn.Beside, true);
    await this.load();
  }

  get taskId(): Id | undefined {
    return this.node?.kind === "task" ? this.node.task.id : undefined;
  }

  refreshIfShowing(taskId: Id): void {
    if (this.node?.kind !== "task") {
      return;
    }
    if (sameId(this.node.task.id, taskId) || sameId(this.focused?.id, taskId)) {
      void this.load();
    }
  }

  private target(): TimerTarget | undefined {
    if (this.node?.kind !== "task") {
      return undefined;
    }
    const { project, todolist, task } = this.node;
    const current = this.focused ?? task;
    return {
      projectId: project.id,
      todolistId: todolist.id,
      taskId: current.id,
      parentTaskId: this.focused ? task.id : undefined,
      title: current.title,
    };
  }

  private paint(view: TaskView): void {
    if (!this.panel) {
      return;
    }
    this.view = view;
    this.panel.title = view.task.title;
    this.panel.webview.html = page(renderBody(view));
  }

  private busy(on: boolean): void {
    void this.panel?.webview.postMessage({ act: "busy", value: on });
  }

  private async load(options: { silent?: boolean } = {}): Promise<void> {
    const session = this.host.session();
    const node = this.node;
    if (!session || !this.panel || node?.kind !== "task") {
      return;
    }
    const silent = options.silent && Boolean(this.view);
    if (silent) {
      this.busy(true);
    } else {
      this.view = undefined;
      this.panel.webview.html = page(`<p class="empty">${t.common.loading}</p>`);
    }
    if (this.myName === undefined) {
      void this.host.myName().then((name) => {
        this.myName = name;
      });
    }
    const ticket = (this.loadToken += 1);
    try {
      const view = this.focused
        ? await this.subtaskView(session, node, this.focused.id)
        : await this.taskView(session, node);
      if (ticket !== this.loadToken) {
        return;
      }
      this.paint(view);
    } catch (error) {
      if (ticket !== this.loadToken) {
        return;
      }
      this.view = undefined;
      this.panel.webview.html = page(
        `<p class="empty">${describeFailure(error)}</p><p class="actions"><button data-act="refresh">${t.common.tryAgain}</button></p>`,
      );
    } finally {
      if (ticket === this.loadToken) {
        this.busy(false);
      }
    }
  }

  private patch(change: (view: TaskView) => TaskView): void {
    if (this.view) {
      this.paint(change(this.view));
    }
  }

  private async taskView(session: Session, node: Node & { kind: "task" }): Promise<TaskView> {
    const { client } = session;
    const { project, todolist, task } = node;
    const [subtasks, fresh, comments, entries, names] = await Promise.all([
      settle(client.subtasks(project.id, todolist.id, task.id)),
      settle(client.task(project.id, todolist.id, task.id)),
      settle(client.comments(project.id, todolist.id, task.id)),
      settle(this.entriesOf(session, project.id)),
      this.names(session),
    ]);
    const targets = [
      { id: task.id, title: task.title },
      ...(subtasks.value ?? []).map((item) => ({ id: item.id, title: item.title })),
    ];
    const time = {
      value: this.match(entries.value ?? [], targets, names),
      error: entries.error,
    };
    this.node = { ...node, task: { ...task, ...(fresh.value ?? {}) } };
    const current = (this.node as Node & { kind: "task" }).task;
    return {
      projectTitle: project.title,
      todolistTitle: todolist.title,
      task: current,
      assignees: this.namesOf(current.assigned, names),
      subtasks: subtasks.value ?? [],
      comments: this.withAuthors(comments.value ?? [], names),
      time: time.value ?? [],
      timerRunning: this.host.timerRunsOn(current.id),
      timerSince: this.host.timerStartedAt(current.id),
      problems: { subtasks: subtasks.error, comments: comments.error, time: time.error },
    };
  }

  private async subtaskView(
    session: Session,
    node: Node & { kind: "task" },
    subtaskId: Id,
  ): Promise<TaskView> {
    const { client } = session;
    const { project, todolist, task } = node;
    const [fresh, comments, entries, names] = await Promise.all([
      settle(client.subtask(project.id, todolist.id, task.id, subtaskId)),
      settle(client.subtaskComments(project.id, todolist.id, task.id, subtaskId)),
      settle(this.entriesOf(session, project.id)),
      this.names(session),
    ]);
    const time = {
      value: this.match(entries.value ?? [], [{ id: subtaskId }], names),
      error: entries.error,
    };
    const subtask = { ...this.focused, ...(fresh.value ?? {}) } as Subtask;
    this.focused = subtask;
    return {
      projectTitle: project.title,
      todolistTitle: todolist.title,
      parentTitle: task.title,
      isSubtask: true,
      task: subtask,
      assignees: this.namesOf(subtask.assigned, names),
      subtasks: [],
      comments: this.withAuthors(comments.value ?? [], names),
      time: time.value ?? [],
      timerRunning: this.host.timerRunsOn(subtask.id),
      timerSince: this.host.timerStartedAt(subtask.id),
      problems: { comments: comments.error, time: time.error },
    };
  }

  private namesOf(assigned: Id[] | undefined, names: Map<string, string>): string[] {
    return (assigned ?? []).map((id) => names.get(String(id)) ?? String(id));
  }

  private withAuthors<T extends { creator?: { id: Id } }>(
    comments: T[],
    names: Map<string, string>,
  ): (T & { authorName?: string })[] {
    return comments.map((comment) => ({
      ...comment,
      authorName: names.get(String(comment.creator?.id)),
    }));
  }

  private async names(session: Session): Promise<Map<string, string>> {
    if (!this.people) {
      const people: Person[] = await session.client.people().catch(() => []);
      this.people = new Map(people.map((person) => [String(person.id), personName(person)]));
    }
    return this.people;
  }

  private async entriesOf(session: Session, projectId: Id): Promise<TimeEntry[]> {
    const sheets = await session.client.timesheets(projectId).catch(() => []);
    const pages = await Promise.all(
      sheets.map((sheet) => session.client.timeEntries(projectId, sheet.id).catch(() => [])),
    );
    return pages.flat();
  }

  private match(
    entries: TimeEntry[],
    wanted: { id: Id; title?: string }[],
    names: Map<string, string>,
  ): LoggedEntry[] {
    const main = wanted[0]?.id;
    return entries
      .flatMap((entry) => {
        const targets = entryTargets(entry);
        const found = wanted.find((item) => targets.some((id) => sameId(id, item.id)));
        return found
          ? [
              {
                ...entry,
                authorName: names.get(String(entry.creator?.id)),
                targetTitle: sameId(found.id, main) ? undefined : found.title,
              },
            ]
          : [];
      })
      .sort((left, right) => String(right.date ?? "").localeCompare(String(left.date ?? "")));
  }

  private async handle(message: { act?: string; id?: string; value?: unknown }): Promise<void> {
    const session = this.host.session();
    const node = this.node;
    const target = this.target();
    if (!session || node?.kind !== "task" || !target) {
      return;
    }
    const { client } = session;
    const { project, todolist, task } = node;
    const onSubtask = Boolean(this.focused);
    const fields = (message.value ?? {}) as Record<string, string>;

    try {
      switch (message.act) {
        case "refresh":
          await this.load();
          return;
        case "open":
          await this.host.openInBrowser(node);
          return;
        case "back":
          this.focused = undefined;
          await this.load();
          return;
        case "openSubtask": {
          if (!message.id) {
            return;
          }
          this.focused = { id: message.id, title: "" } as Subtask;
          await this.load();
          return;
        }
        case "startTimer":
          this.patch((view) => ({ ...view, timerRunning: true, timerSince: Date.now() }));
          await this.host.startTimer(target);
          break;
        case "stopTimer":
          this.patch((view) => ({ ...view, timerRunning: false, timerSince: undefined }));
          await this.host.stopTimer(target.taskId);
          break;
        case "complete":
        case "reopen": {
          const completed = message.act === "complete";
          this.patch((view) => ({ ...view, task: { ...view.task, completed } }));
          await (onSubtask
            ? client.updateSubtask(project.id, todolist.id, task.id, target.taskId, { completed })
            : client.updateTask(project.id, todolist.id, task.id, { completed }));
          break;
        }
        case "toggleSubtask": {
          if (!message.id) {
            return;
          }
          const completed = Boolean(message.value);
          this.patch((view) => ({
            ...view,
            subtasks: view.subtasks.map((item) =>
              sameId(item.id, message.id) ? { ...item, completed } : item,
            ),
          }));
          await client.updateSubtask(project.id, todolist.id, task.id, message.id, { completed });
          break;
        }
        case "subtask": {
          const title = fields.title?.trim();
          if (!title) {
            return;
          }
          this.patch((view) => ({
            ...view,
            subtasks: [...view.subtasks, { id: `pending-${view.subtasks.length}`, title }],
          }));
          await client.createSubtask(project.id, todolist.id, task.id, { title });
          break;
        }
        case "comment": {
          const content = fields.content?.trim();
          if (!content) {
            return;
          }
          this.patch((view) => ({
            ...view,
            comments: [
              ...view.comments,
              {
                id: `pending-${view.comments.length}`,
                description: content,
                created_at: new Date().toISOString(),
                authorName: this.myName,
              },
            ],
          }));
          await (onSubtask
            ? client.addSubtaskComment(project.id, todolist.id, task.id, target.taskId, content)
            : client.addComment(project.id, todolist.id, task.id, content));
          break;
        }
        case "time": {
          const hours = fields.hours?.trim();
          if (!hours || !HOURS_PATTERN.test(hours)) {
            vscode.window.showWarningMessage(t.time.hoursInvalid);
            return;
          }
          const sheets = await client.timesheets(project.id);
          if (sheets.length === 0) {
            vscode.window.showWarningMessage(t.time.noTimesheet);
            return;
          }
          const minutes = parseHours(hours);
          this.patch((view) => ({
            ...view,
            time: [
              {
                id: `pending-${view.time.length}`,
                logged_hours: Math.floor(minutes / 60),
                logged_mins: minutes % 60,
                date: today(),
                description: fields.description?.trim() ?? "",
                authorName: this.myName,
              },
              ...view.time,
            ],
          }));
          await client.logTime({
            project: project.id,
            timesheet_id: sheets[0].id,
            date: today(),
            logged_hours: String(Math.floor(minutes / 60)),
            logged_mins: String(minutes % 60),
            description: fields.description?.trim() ?? "",
            list_id: todolist.id,
            task_id: target.taskId,
          });
          break;
        }
        default:
          return;
      }
      await this.load({ silent: true });
      if (this.node?.kind === "task") {
        this.host.onChanged(this.node);
      }
    } catch (error) {
      vscode.window.showErrorMessage(describeFailure(error));
      await this.load({ silent: true });
    }
  }
}
