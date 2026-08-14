import * as vscode from "vscode";
import type { Session } from "./auth.js";
import { describeFailure } from "./auth.js";
import type { Project, Task, Todolist } from "./types.js";

export type Node =
  | { kind: "project"; project: Project }
  | { kind: "todolist"; project: Project; todolist: Todolist }
  | { kind: "task"; project: Project; todolist: Todolist; task: Task };

export class ProjectsProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private session: Session | undefined;
  private readonly cache = new Map<string, Node[]>();

  setSession(session: Session | undefined): void {
    this.session = session;
    this.refresh();
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
        item.description = taskDescription(node.task);
        item.tooltip = node.task.description;
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
        const tasks = await client.tasks(node.project.id, node.todolist.id);
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

function taskDescription(task: Task): string {
  const parts: string[] = [];
  if (task.due_date) {
    parts.push(task.due_date);
  }
  if (task.sub_tasks) {
    parts.push(`${task.sub_tasks} subtasks`);
  }
  return parts.join("  ");
}
