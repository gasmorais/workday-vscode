import * as vscode from "vscode";
import type { Session } from "../auth.js";
import { parseHours } from "../format.js";
import { t } from "../strings.js";
import { personName, type Project, type Task, type Todolist } from "../types.js";

export interface CreateTarget {
  project: Project;
  todolist: Todolist;
}

export async function pickTarget(
  session: Session,
  known?: Partial<CreateTarget>,
): Promise<CreateTarget | undefined> {
  const project = known?.project ?? (await pickProject(session));
  if (!project) {
    return undefined;
  }
  const todolist = known?.todolist ?? (await pickTodolist(session, project));
  return todolist ? { project, todolist } : undefined;
}

async function pickProject(session: Session): Promise<Project | undefined> {
  const projects = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: t.flow.loadingProjects },
    () => session.client.projects(false),
  );
  const picked = await vscode.window.showQuickPick(
    projects.map((project) => ({
      label: project.title,
      description: project.description ? "" : undefined,
      project,
    })),
    { title: t.flow.pickProject, matchOnDescription: true, ignoreFocusOut: true },
  );
  return picked?.project;
}

async function pickTodolist(session: Session, project: Project): Promise<Todolist | undefined> {
  const lists = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: t.flow.loadingLists },
    () => session.client.todolists(project.id),
  );
  if (lists.length === 0) {
    vscode.window.showWarningMessage(t.flow.noLists(project.title));
    return undefined;
  }
  if (lists.length === 1) {
    return lists[0];
  }
  const picked = await vscode.window.showQuickPick(
    lists.map((todolist) => ({ label: todolist.title, todolist })),
    { title: t.flow.pickList(project.title), ignoreFocusOut: true },
  );
  return picked?.todolist;
}

export async function pickAssignees(
  session: Session,
  current: string[] = [],
): Promise<string[] | undefined> {
  const people = await session.client.people();
  const picked = await vscode.window.showQuickPick(
    people.map((person) => ({
      label: personName(person),
      description: person.email,
      id: String(person.id),
      picked: current.map(String).includes(String(person.id)),
    })),
    {
      title: t.flow.assignTo,
      placeHolder: t.flow.assignHint,
      canPickMany: true,
      matchOnDescription: true,
      ignoreFocusOut: true,
    },
  );
  return picked?.map((entry) => entry.id);
}

export async function askDueDate(current?: string): Promise<string | undefined> {
  const answer = await vscode.window.showInputBox({
    title: t.task.dueTitle,
    prompt: t.task.duePrompt,
    value: current ?? "",
    ignoreFocusOut: true,
    validateInput: (value) =>
      !value.trim() || /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? undefined : t.task.dueInvalid,
  });
  return answer?.trim();
}

export async function askEstimate(current?: string): Promise<string | undefined> {
  const answer = await vscode.window.showInputBox({
    title: t.flow.estimateTitle,
    prompt: t.flow.estimatePrompt,
    value: current ?? "",
    ignoreFocusOut: true,
    validateInput: (value) =>
      !value.trim() || /^\d{1,3}:[0-5]\d$/.test(value.trim()) ? undefined : t.time.hoursInvalid,
  });
  return answer?.trim();
}

export async function createTask(
  session: Session,
  known?: Partial<CreateTarget>,
): Promise<{ target: CreateTarget; task: Task } | undefined> {
  const target = await pickTarget(session, known);
  if (!target) {
    return undefined;
  }

  const title = await vscode.window.showInputBox({
    title: t.task.newTitle(`${target.project.title} › ${target.todolist.title}`),
    prompt: t.task.titlePrompt,
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() ? undefined : t.task.titleEmpty),
  });
  if (!title?.trim()) {
    return undefined;
  }

  const payload: Partial<Task> = { title: title.trim() };
  const assignees = await pickAssignees(session);
  if (assignees === undefined) {
    return undefined;
  }
  if (assignees.length > 0) {
    payload.assigned = assignees;
  }

  const due = await askDueDate();
  if (due) {
    payload.due_date = due;
  }

  const estimate = await askEstimate();
  if (estimate) {
    const minutes = parseHours(estimate);
    payload.estimated_hours = Math.floor(minutes / 60);
    payload.estimated_mins = minutes % 60;
  }

  const task = await session.client.createTask(target.project.id, target.todolist.id, payload);
  return { target, task };
}
