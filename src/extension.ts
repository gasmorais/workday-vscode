import * as vscode from "vscode";
import { connect, describeFailure, disconnect, restoreSession, type Session } from "./auth.js";
import { ProjectsProvider, type Node } from "./tree.js";
import { Timer } from "./timer.js";
import { formatDuration, today } from "./time.js";
import { personName, type Task } from "./types.js";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const provider = new ProjectsProvider();
  const timer = new Timer(context);
  let session: Session | undefined = await restoreSession(context);
  provider.setSession(session);

  const view = vscode.window.createTreeView("proofhub.projects", { treeDataProvider: provider });
  context.subscriptions.push(view);

  const requireSession = async (): Promise<Session | undefined> => {
    if (session) {
      return session;
    }
    vscode.window.showWarningMessage("Connect to ProofHub first.");
    return undefined;
  };

  const guard = (run: () => Promise<void>) => async () => {
    try {
      await run();
    } catch (error) {
      vscode.window.showErrorMessage(describeFailure(error));
    }
  };

  const command = (name: string, run: (...args: never[]) => Promise<void>) =>
    context.subscriptions.push(
      vscode.commands.registerCommand(name, (...args: never[]) => guard(() => run(...args))()),
    );

  command("proofhub.connect", async () => {
    const created = await connect(context);
    if (created) {
      session = created;
      provider.setSession(session);
    }
  });

  command("proofhub.disconnect", async () => {
    await disconnect(context);
    session = undefined;
    provider.setSession(undefined);
  });

  command("proofhub.refresh", async () => {
    provider.refresh();
  });

  command("proofhub.openInBrowser", async (node: Node) => {
    const active = await requireSession();
    if (!active || !node) {
      return;
    }
    const target =
      node.kind === "task"
        ? node.task.url ?? `todos/${node.task.id}`
        : node.kind === "todolist"
          ? node.todolist.id && `todolists/${node.todolist.id}`
          : node.project.url ?? `projects/${node.project.id}`;
    await vscode.env.openExternal(
      vscode.Uri.parse(/^https?:/.test(String(target)) ? String(target) : active.client.webUrl(String(target))),
    );
  });

  command("proofhub.createTask", async (node?: Node) => {
    const active = await requireSession();
    if (!active) {
      return;
    }
    const target = node ?? (view.selection[0] as Node | undefined);
    if (!target || target.kind === "project") {
      vscode.window.showWarningMessage("Select a todolist to create the task in.");
      return;
    }
    const { project, todolist } = target;

    const title = await vscode.window.showInputBox({
      title: `New task in ${todolist.title}`,
      prompt: "Task title",
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() ? undefined : "The title cannot be empty"),
    });
    if (!title) {
      return;
    }

    const people = await active.client.people();
    const picked = await vscode.window.showQuickPick(
      [
        { label: "Nobody", id: undefined as string | undefined },
        ...people.map((person) => ({ label: personName(person), id: person.id })),
      ],
      { title: "Assign to", ignoreFocusOut: true },
    );

    const due = await vscode.window.showInputBox({
      title: "Due date",
      prompt: "YYYY-MM-DD, or leave empty",
      ignoreFocusOut: true,
      validateInput: (value) =>
        !value.trim() || /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? undefined : "Use YYYY-MM-DD",
    });

    const payload: Partial<Task> = { title: title.trim() };
    if (picked?.id) {
      payload.assigned = [picked.id];
    }
    if (due?.trim()) {
      payload.due_date = due.trim();
    }

    await active.client.createTask(project.id, todolist.id, payload);
    provider.refresh();
    vscode.window.showInformationMessage(`Task created in ${todolist.title}.`);
  });

  command("proofhub.completeTask", async (node: Node) => {
    const active = await requireSession();
    if (!active || node?.kind !== "task") {
      return;
    }
    await active.client.completeTask(node.project.id, node.todolist.id, node.task.id);
    provider.refresh();
    vscode.window.showInformationMessage(`Completed ${node.task.title}.`);
  });

  command("proofhub.comment", async (node: Node) => {
    const active = await requireSession();
    if (!active || node?.kind !== "task") {
      return;
    }
    const content = await vscode.window.showInputBox({
      title: `Comment on ${node.task.title}`,
      prompt: "Your comment",
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() ? undefined : "The comment cannot be empty"),
    });
    if (!content) {
      return;
    }
    await active.client.addComment(node.project.id, node.todolist.id, node.task.id, content.trim());
    vscode.window.showInformationMessage("Comment posted.");
  });

  command("proofhub.startTimer", async (node: Node) => {
    const active = await requireSession();
    if (!active || node?.kind !== "task") {
      return;
    }
    const running = timer.running;
    if (running) {
      vscode.window.showWarningMessage(`A timer is already running on ${running.title}.`);
      return;
    }
    await timer.start({
      projectId: node.project.id,
      todolistId: node.todolist.id,
      taskId: node.task.id,
      title: node.task.title,
      startedAt: Date.now(),
    });
  });

  command("proofhub.stopTimer", async () => {
    const active = await requireSession();
    if (!active) {
      return;
    }
    const running = timer.running;
    if (!running) {
      vscode.window.showInformationMessage("No timer is running.");
      return;
    }
    const hours = formatDuration(Date.now() - running.startedAt);
    await logTimeFor(active, running.projectId, running.taskId, running.title, hours);
    await timer.stop();
  });

  command("proofhub.logTime", async (node: Node) => {
    const active = await requireSession();
    if (!active || node?.kind !== "task") {
      return;
    }
    const hours = await vscode.window.showInputBox({
      title: `Log time on ${node.task.title}`,
      prompt: "Hours as H:MM",
      value: "1:00",
      ignoreFocusOut: true,
      validateInput: (value) => (/^\d{1,3}:[0-5]\d$/.test(value.trim()) ? undefined : "Use H:MM"),
    });
    if (!hours) {
      return;
    }
    await logTimeFor(active, node.project.id, node.task.id, node.task.title, hours.trim());
  });

  command("proofhub.myTasks", async () => {
    const active = await requireSession();
    if (!active) {
      return;
    }
    const me = await active.client.me();
    const projects = await active.client.projects(false);
    const mine: { label: string; description: string; node: Node }[] = [];

    for (const project of projects) {
      for (const todolist of await active.client.todolists(project.id)) {
        for (const task of await active.client.tasks(project.id, todolist.id)) {
          if (!task.completed && task.assigned?.includes(me.id)) {
            mine.push({
              label: task.title,
              description: `${project.title} › ${todolist.title}`,
              node: { kind: "task", project, todolist, task },
            });
          }
        }
      }
    }

    if (mine.length === 0) {
      vscode.window.showInformationMessage("No open tasks assigned to you.");
      return;
    }
    const picked = await vscode.window.showQuickPick(mine, { title: "My open tasks" });
    if (picked) {
      await vscode.commands.executeCommand("proofhub.openInBrowser", picked.node);
    }
  });
}

async function logTimeFor(
  session: Session,
  projectId: string,
  taskId: string,
  taskTitle: string,
  hours: string,
): Promise<void> {
  const sheets = await session.client.timesheets(projectId);
  if (sheets.length === 0) {
    vscode.window.showWarningMessage("This project has no timesheet to log time into.");
    return;
  }
  const sheet =
    sheets.length === 1
      ? sheets[0]
      : await vscode.window
          .showQuickPick(
            sheets.map((s) => ({ label: s.title, id: s.id })),
            { title: "Timesheet", ignoreFocusOut: true },
          )
          .then((picked) => (picked ? { id: picked.id, title: picked.label } : undefined));
  if (!sheet) {
    return;
  }

  const description = await vscode.window.showInputBox({
    title: `Log ${hours} on ${taskTitle}`,
    prompt: "What did you work on",
    ignoreFocusOut: true,
  });
  if (description === undefined) {
    return;
  }

  await session.client.logTime(projectId, sheet.id, {
    hours,
    description: description.trim(),
    logged_date: today(),
    task_id: taskId,
  });
  vscode.window.showInformationMessage(`Logged ${hours} on ${taskTitle}.`);
}

export function deactivate(): void {}
