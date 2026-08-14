import * as vscode from "vscode";
import type { Session } from "./auth.js";
import { describeFailure } from "./auth.js";
import type { Person, Project, Task, Todolist } from "./types.js";
import { personName } from "./types.js";
import { applyFilter, EMPTY_FILTER, sortTasks, type SortKey, type TaskFilter } from "./filter.js";
import { firstLine } from "./html.js";
import { formatMinutes, toDate } from "./format.js";
import { t } from "./strings.js";

export type Node =
  | { kind: "project"; project: Project }
  | { kind: "todolist"; project: Project; todolist: Todolist }
  | { kind: "task"; project: Project; todolist: Todolist; task: Task };

export class ProjectsProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private session: Session | undefined;
  private readonly cache = new Map<string, Node[]>();
  private names = new Map<string, string>();
  filter: TaskFilter = { ...EMPTY_FILTER };
  sort: SortKey = "list";

  setSession(session: Session | undefined): void {
    this.session = session;
    this.names = new Map();
    this.filter = { ...EMPTY_FILTER };
    this.refresh();
  }

  setFilter(filter: TaskFilter): void {
    this.filter = filter;
    this.refresh();
  }

  setSort(sort: SortKey): void {
    this.sort = sort;
    this.refresh();
  }

  nameOf(id: string): string {
    return this.names.get(String(id)) ?? String(id);
  }

  private async loadNames(): Promise<void> {
    if (this.names.size > 0 || !this.session) {
      return;
    }
    const people: Person[] = await this.session.client.people().catch(() => []);
    this.names = new Map(people.map((person) => [String(person.id), personName(person)]));
  }

  refresh(node?: Node): void {
    if (node) {
      this.cache.delete(cacheKey(node));
    } else {
      this.cache.clear();
    }
    this.changed.fire(node);
  }

  getParent(node: Node): Node | undefined {
    if (node.kind === "todolist") {
      return { kind: "project", project: node.project };
    }
    if (node.kind === "task") {
      return { kind: "todolist", project: node.project, todolist: node.todolist };
    }
    return undefined;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    switch (node.kind) {
      case "project": {
        const item = new vscode.TreeItem(
          node.project.title,
          vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.id = `project:${node.project.id}`;
        item.contextValue = "project";
        item.iconPath = new vscode.ThemeIcon("project");
        item.tooltip = node.project.description;
        return item;
      }
      case "todolist": {
        const item = new vscode.TreeItem(
          node.todolist.title,
          vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.id = `todolist:${node.project.id}:${node.todolist.id}`;
        item.contextValue = "todolist";
        item.iconPath = new vscode.ThemeIcon("checklist");
        return item;
      }
      case "task": {
        const item = new vscode.TreeItem(node.task.title, vscode.TreeItemCollapsibleState.None);
        item.id = `task:${node.todolist.id}:${node.task.id}`;
        item.contextValue = "task";
        item.iconPath = new vscode.ThemeIcon(node.task.completed ? "pass-filled" : "circle-large-outline");
        item.description = taskDescription(node.task, (id) => this.nameOf(id));
        item.tooltip = taskTooltip(node);
        if (isOverdue(node.task)) {
          item.iconPath = new vscode.ThemeIcon(
            "circle-large-outline",
            new vscode.ThemeColor("charts.red"),
          );
        }
        item.command = {
          command: "proofhub.openTask",
          title: "Open Task",
          arguments: [node],
        };
        return item;
      }
    }
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (!this.session) {
      return [];
    }
    const { client } = this.session;
    const key = node ? cacheKey(node) : "root";
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }
    try {
      if (!node) {
        const archived = vscode.workspace
          .getConfiguration("proofhub")
          .get<boolean>("archivedProjects", false);
        const projects = await client.projects(archived);
        const children: Node[] = projects.map((project) => ({ kind: "project", project }));
        this.cache.set(key, children);
        return children;
      }
      if (node.kind === "project") {
        const todolists = await client.todolists(node.project.id);
        const children: Node[] = todolists.map((todolist) => ({
          kind: "todolist",
          project: node.project,
          todolist,
        }));
        this.cache.set(key, children);
        return children;
      }
      if (node.kind === "todolist") {
        await this.loadNames();
        const all = await client.tasks(node.project.id, node.todolist.id);
        const tasks = sortTasks(applyFilter(all, this.filter), this.sort);
        const children: Node[] = tasks.map((task) => ({
          kind: "task",
          project: node.project,
          todolist: node.todolist,
          task,
        }));
        this.cache.set(key, children);
        return children;
      }
      return [];
    } catch (error) {
      vscode.window.showErrorMessage(describeFailure(error));
      return [];
    }
  }
}

function cacheKey(node: Node): string {
  switch (node.kind) {
    case "project":
      return `project:${node.project.id}`;
    case "todolist":
      return `todolist:${node.todolist.id}`;
    case "task":
      return `task:${node.task.id}`;
  }
}

function taskDescription(task: Task, nameOf: (id: string) => string): string {
  const parts: string[] = [];
  if (task.due_date) {
    parts.push(isOverdue(task) ? `⚑ ${task.due_date}` : task.due_date);
  }
  const people = (task.assigned ?? []).map((id) => initials(nameOf(String(id))));
  if (people.length > 0) {
    parts.push(people.join(" "));
  }
  if (task.sub_tasks) {
    parts.push(t.tree.subtasks(task.sub_tasks));
  }
  const estimate = (task.estimated_hours ?? 0) * 60 + (task.estimated_mins ?? 0);
  if (estimate > 0) {
    parts.push(formatMinutes(estimate));
  }
  return parts.join("  ·  ");
}

function taskTooltip(node: Node & { kind: "task" }): vscode.MarkdownString {
  const text = new vscode.MarkdownString();
  text.appendMarkdown(`**${node.task.title}**\n\n`);
  text.appendMarkdown(`${node.project.title} › ${node.todolist.title}\n\n`);
  const summary = firstLine(node.task.description ?? "", 240);
  if (summary) {
    text.appendMarkdown(summary);
  }
  return text;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "";
  }
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

function isOverdue(task: Task): boolean {
  const due = toDate(task.due_date);
  if (task.completed || !due) {
    return false;
  }
  const now = new Date();
  return due.getTime() < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}
