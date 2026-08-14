import * as vscode from "vscode";
import { describeFailure, type Session } from "./auth.js";
import { renderBody, type TaskView } from "./components/sections.js";
import { page } from "./components/shell.js";
import { parseHours } from "./format.js";
import { t } from "./locales/index.js";
import { today } from "./time.js";
import type { Node } from "./tree.js";
import { entryTargets, personName, sameId, type Id, type Person, type Subtask } from "./types.js";
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

  private async load(): Promise<void> {
    const session = this.host.session();
    const node = this.node;
    if (!session || !this.panel || node?.kind !== "task") {
      return;
    }
    this.panel.webview.html = page(`<p class="empty">${t.common.loading}</p>`);
    try {
      const view = this.focused
        ? await this.subtaskView(session, node, this.focused.id)
        : await this.taskView(session, node);
      this.panel.title = view.task.title;
      this.panel.webview.html = page(renderBody(view));
    } catch (error) {
      this.panel.webview.html = page(
        `<p class="empty">${describeFailure(error)}</p><p class="actions"><button data-act="refresh">${t.common.tryAgain}</button></p>`,
      );
    }
  }

  private async taskView(session: Session, node: Node & { kind: "task" }): Promise<TaskView> {
    const { client } = session;
    const { project, todolist, task } = node;
    const subtasks = await settle(client.subtasks(project.id, todolist.id, task.id));
    const targets = [
      { id: task.id, title: task.title },
      ...(subtasks.value ?? []).map((item) => ({ id: item.id, title: item.title })),
    ];
    const [fresh, comments, time] = await Promise.all([
      settle(client.task(project.id, todolist.id, task.id)),
      settle(client.comments(project.id, todolist.id, task.id)),
      settle(this.timeOf(session, project.id, targets)),
    ]);
    this.node = { ...node, task: { ...task, ...(fresh.value ?? {}) } };
    const current = (this.node as Node & { kind: "task" }).task;
    const names = await this.names(session);
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
    const [fresh, comments, time] = await Promise.all([
      settle(client.subtask(project.id, todolist.id, task.id, subtaskId)),
      settle(client.subtaskComments(project.id, todolist.id, task.id, subtaskId)),
      settle(this.timeOf(session, project.id, [{ id: subtaskId }])),
    ]);
    const subtask = { ...this.focused, ...(fresh.value ?? {}) } as Subtask;
    this.focused = subtask;
    const names = await this.names(session);
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

  private async timeOf(
    session: Session,
    projectId: Id,
    wanted: { id: Id; title?: string }[],
  ): Promise<LoggedEntry[]> {
    const sheets = await session.client.timesheets(projectId).catch(() => []);
    const pages = await Promise.all(
      sheets.map((sheet) => session.client.timeEntries(projectId, sheet.id).catch(() => [])),
    );
    const names = await this.names(session);
    const main = wanted[0]?.id;
    return pages
      .flat()
      .map((entry) => {
        const targets = entryTargets(entry);
        const match = wanted.find((item) => targets.some((id) => sameId(id, item.id)));
        return match ? { entry, match } : undefined;
      })
      .filter((row): row is { entry: LoggedEntry; match: { id: Id; title?: string } } =>
        Boolean(row),
      )
      .map(({ entry, match }) => ({
        ...entry,
        authorName: names.get(String(entry.creator?.id)),
        targetTitle: sameId(match.id, main) ? undefined : match.title,
      }))
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
          await this.host.startTimer(target);
          break;
        case "stopTimer":
          await this.host.stopTimer(target.taskId);
          break;
        case "complete":
        case "reopen": {
          const completed = message.act === "complete";
          await (onSubtask
            ? client.updateSubtask(project.id, todolist.id, task.id, target.taskId, { completed })
            : client.updateTask(project.id, todolist.id, task.id, { completed }));
          break;
        }
        case "toggleSubtask":
          if (!message.id) {
            return;
          }
          await client.updateSubtask(project.id, todolist.id, task.id, message.id, {
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
      this.host.onChanged(node);
      await this.load();
    } catch (error) {
      vscode.window.showErrorMessage(describeFailure(error));
      await this.load();
    }
  }
}
