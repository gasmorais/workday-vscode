import * as vscode from "vscode";
import { connect, describeFailure, disconnect, restoreSession, type Session } from "./auth.js";
import { ProjectsProvider, type Node } from "./tree.js";
import { Timer } from "./timer.js";
import { formatDuration, today } from "./time.js";
import { parseHours } from "./format.js";
import { personName, sameId, type Id } from "./types.js";
import { resolveMe } from "./me.js";
import { parseAppUrl } from "./urls.js";
import { t, useLocale } from "./locales/index.js";
import { TaskDetail, type TimerTarget } from "./detail.js";
import { ReportPanel } from "./report-panel.js";
import { createTask as runCreateTask } from "./flows/create-task.js";
import { EMPTY_FILTER, isActive, type SortKey } from "./filter.js";
import { CONFIG_SECTION, FOCUS_SYNC_DEBOUNCE_MS, HOURS_PATTERN } from "./constants.js";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  useLocale(vscode.env.language);
  const provider = new ProjectsProvider();
  const timer = new Timer(context);
  let session: Session | undefined = await restoreSession(context);
  provider.setSession(session);

  const view = vscode.window.createTreeView("proofhub.projects", { treeDataProvider: provider });
  context.subscriptions.push(view);

  const detail = new TaskDetail({
    session: () => session,
    onChanged: (node) => {
      if (node.kind === "task") {
        provider.patchTask(node);
      } else {
        provider.refresh(provider.getParent(node));
      }
    },
    timerRunsOn: (taskId) => Boolean(timer.on(taskId)),
    timerStartedAt: (taskId) => timer.on(taskId)?.startedAt,
    startTimer: (target) => startTimerOn(target),
    stopTimer: (taskId) => stopTimerOn(taskId),
    openInBrowser: (node) => vscode.commands.executeCommand("proofhub.openInBrowser", node),
    myName: async () => {
      const person = session ? await resolveMe(context, session.client, { ask: false }) : undefined;
      return person ? personName(person) : undefined;
    },
  });

  const whoAmI = async () =>
    session ? resolveMe(context, session.client, { ask: true }) : undefined;

  const report = new ReportPanel(() => session, whoAmI);

  const showFilter = () => {
    const parts: string[] = [];
    if (provider.filter.text.trim()) {
      parts.push(`"${provider.filter.text.trim()}"`);
    }
    if (provider.filter.mine) {
      parts.push(t.filter.mine.toLowerCase());
    }
    if (provider.filter.hideCompleted) {
      parts.push(t.filter.hideCompleted.toLowerCase());
    }
    if (provider.filter.overdueOnly) {
      parts.push(t.filter.overdue.toLowerCase());
    }
    view.description = isActive(provider.filter) ? t.filter.active(parts.join(", ")) : undefined;
    void vscode.commands.executeCommand(
      "setContext",
      "proofhub.filtering",
      isActive(provider.filter),
    );
  };

  const requireSession = async (): Promise<Session | undefined> => {
    if (session) {
      return session;
    }
    vscode.window.showWarningMessage(t.common.connectFirst);
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

  command("proofhub.moveToRight", async () => {
    await moveViewToRight();
  });

  if (
    vscode.workspace.getConfiguration(CONFIG_SECTION).get<boolean>("openOnRight", true) &&
    !context.globalState.get<boolean>("movedToRight")
  ) {
    await context.globalState.update("movedToRight", true);
    void moveViewToRight();
  }

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
    const open = detail.taskId;
    if (open) {
      detail.refreshIfShowing(open);
    }
  });

  command("proofhub.openTask", async (node: Node) => {
    if (node?.kind === "task") {
      await detail.show(node);
    }
  });

  let lastSync = 0;
  const syncNow = () => {
    lastSync = Date.now();
    provider.refresh();
    const open = detail.taskId;
    if (open) {
      detail.refreshIfShowing(open);
    }
  };

  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => {
      if (!state.focused || !session) {
        return;
      }
      if (!vscode.workspace.getConfiguration(CONFIG_SECTION).get<boolean>("syncOnFocus", true)) {
        return;
      }
      if (Date.now() - lastSync < FOCUS_SYNC_DEBOUNCE_MS) {
        return;
      }
      syncNow();
    }),
  );

  let autoRefresh: ReturnType<typeof setInterval> | undefined;
  const scheduleAutoRefresh = () => {
    if (autoRefresh) {
      clearInterval(autoRefresh);
      autoRefresh = undefined;
    }
    const minutes = vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .get<number>("autoRefreshMinutes", 0);
    if (minutes > 0) {
      autoRefresh = setInterval(() => {
        if (session && vscode.window.state.focused) {
          syncNow();
        }
      }, minutes * 60_000);
    }
  };
  scheduleAutoRefresh();
  context.subscriptions.push({
    dispose: () => {
      if (autoRefresh) {
        clearInterval(autoRefresh);
      }
    },
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (!event.affectsConfiguration(CONFIG_SECTION)) {
        return;
      }
      if (event.affectsConfiguration(`${CONFIG_SECTION}.autoRefreshMinutes`)) {
        scheduleAutoRefresh();
      }
      if (
        event.affectsConfiguration(`${CONFIG_SECTION}.account`) ||
        event.affectsConfiguration(`${CONFIG_SECTION}.contactEmail`)
      ) {
        session = await restoreSession(context);
        provider.setSession(session);
        return;
      }
      if (event.affectsConfiguration(`${CONFIG_SECTION}.archivedProjects`)) {
        provider.refresh();
      }
    }),
  );

  command("proofhub.openInBrowser", async (node: Node) => {
    const active = await requireSession();
    if (!active || !node) {
      return;
    }
    const url =
      node.kind === "project"
        ? active.client.appUrl({ projectId: node.project.id })
        : node.kind === "todolist"
          ? active.client.appUrl({ projectId: node.project.id, todolistId: node.todolist.id })
          : (node.task.url ??
            active.client.appUrl({ projectId: node.project.id, todolistId: node.todolist.id }));
    await vscode.env.openExternal(vscode.Uri.parse(url));
  });

  command("proofhub.changeAccount", async () => {
    const created = await connect(context, { askAccount: true });
    if (created) {
      session = created;
      provider.setSession(session);
    }
  });

  command("proofhub.openUrl", async () => {
    const active = await requireSession();
    if (!active) {
      return;
    }
    const clipboard = (await vscode.env.clipboard.readText()).trim();
    const input = await vscode.window.showInputBox({
      title: t.link.title,
      prompt: t.link.prompt,
      value: parseAppUrl(clipboard) ? clipboard : "",
      ignoreFocusOut: true,
      validateInput: (value) => (!value.trim() || parseAppUrl(value) ? undefined : t.link.invalid),
    });
    if (!input) {
      return;
    }
    const location = parseAppUrl(input);
    if (!location) {
      return;
    }
    if (location.host !== active.client.accountHost) {
      vscode.window.showWarningMessage(
        t.link.otherAccount(location.host, active.client.accountHost),
      );
      return;
    }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: t.link.looking },
      async () => {
        const projects = await active.client.projects(true);
        const project = projects.find((candidate) => idMatches(candidate.id, location.projectId));
        if (!project) {
          vscode.window.showWarningMessage(t.link.unknownProject);
          return;
        }
        if (!location.todolistId) {
          await view.reveal({ kind: "project", project }, { expand: true });
          return;
        }
        const todolists = await active.client.todolists(project.id);
        const todolist = todolists.find((candidate) =>
          idMatches(candidate.id, location.todolistId!),
        );
        if (!todolist) {
          await view.reveal({ kind: "project", project }, { expand: true });
          return;
        }
        await view.reveal({ kind: "todolist", project, todolist }, { expand: true, select: true });
      },
    );
  });

  command("proofhub.createTask", async (node?: Node) => {
    const active = await requireSession();
    if (!active) {
      return;
    }
    const target = node ?? (view.selection[0] as Node | undefined);
    const known =
      target?.kind === "todolist"
        ? { project: target.project, todolist: target.todolist }
        : target?.kind === "task"
          ? { project: target.project, todolist: target.todolist }
          : target?.kind === "project"
            ? { project: target.project }
            : undefined;

    const created = await runCreateTask(active, known);
    if (!created) {
      return;
    }
    provider.refresh({
      kind: "todolist",
      project: created.target.project,
      todolist: created.target.todolist,
    });
    vscode.window.showInformationMessage(
      t.task.created(`${created.target.project.title} › ${created.target.todolist.title}`),
    );
  });

  command("proofhub.report", async () => {
    if (await requireSession()) {
      await report.show();
    }
  });

  command("proofhub.search", async () => {
    const answer = await vscode.window.showInputBox({
      title: t.filter.search,
      prompt: t.filter.searchPrompt,
      value: provider.filter.text,
      ignoreFocusOut: true,
    });
    if (answer === undefined) {
      return;
    }
    provider.setFilter({ ...provider.filter, text: answer });
    showFilter();
  });

  command("proofhub.filter", async () => {
    const options = [
      { label: t.filter.mine, detail: t.filter.mineDetail, key: "mine" as const },
      {
        label: t.filter.hideCompleted,
        detail: t.filter.hideCompletedDetail,
        key: "hideCompleted" as const,
      },
      { label: t.filter.overdue, detail: t.filter.overdueDetail, key: "overdueOnly" as const },
    ].map((option) => ({ ...option, picked: Boolean(provider.filter[option.key]) }));

    const picked = await vscode.window.showQuickPick(options, {
      title: t.filter.title,
      canPickMany: true,
      ignoreFocusOut: true,
    });
    if (!picked) {
      return;
    }
    const chosen = new Set(picked.map((option) => option.key));
    const meId = chosen.has("mine") ? (await whoAmI())?.id : undefined;
    provider.setFilter({
      ...provider.filter,
      meId,
      mine: chosen.has("mine") && meId !== undefined,
      hideCompleted: chosen.has("hideCompleted"),
      overdueOnly: chosen.has("overdueOnly"),
    });
    showFilter();
  });

  command("proofhub.sort", async () => {
    const options: { label: string; detail: string; key: SortKey }[] = [
      { label: t.filter.sort.list, detail: t.filter.sort.listDetail, key: "list" },
      { label: t.filter.sort.due, detail: t.filter.sort.dueDetail, key: "due" },
      { label: t.filter.sort.title, detail: t.filter.sort.titleDetail, key: "title" },
      { label: t.filter.sort.assigned, detail: t.filter.sort.assignedDetail, key: "assigned" },
    ];
    const picked = await vscode.window.showQuickPick(options, {
      title: t.filter.sortTitle,
      ignoreFocusOut: true,
    });
    if (picked) {
      provider.setSort(picked.key);
    }
  });

  command("proofhub.clearFilter", async () => {
    provider.setFilter({ ...EMPTY_FILTER });
    showFilter();
  });

  command("proofhub.completeTask", async (node: Node) => {
    const active = await requireSession();
    if (!active || node?.kind !== "task") {
      return;
    }
    await active.client.completeTask(node.project.id, node.todolist.id, node.task.id);
    provider.refresh(provider.getParent(node));
    detail.refreshIfShowing(node.task.id);
    vscode.window.showInformationMessage(t.task.completed(node.task.title));
  });

  command("proofhub.comment", async (node: Node) => {
    const active = await requireSession();
    if (!active || node?.kind !== "task") {
      return;
    }
    const content = await vscode.window.showInputBox({
      title: t.task.commentTitle(node.task.title),
      prompt: t.task.commentPrompt,
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() ? undefined : t.task.commentEmpty),
    });
    if (!content) {
      return;
    }
    await active.client.addComment(node.project.id, node.todolist.id, node.task.id, content.trim());
    detail.refreshIfShowing(node.task.id);
    vscode.window.showInformationMessage(t.task.commentPosted);
  });

  const startTimerOn = async (target: TimerTarget) => {
    const started = await timer.start({ ...target, startedAt: Date.now() });
    if (!started) {
      vscode.window.showInformationMessage(t.time.alreadyOnThis(target.title));
      return;
    }
    detail.refreshIfShowing(target.taskId);
  };

  const stopTimerOn = async (taskId?: Id) => {
    const active = await requireSession();
    if (!active) {
      return;
    }
    const running = timer.all;
    if (running.length === 0) {
      vscode.window.showInformationMessage(t.time.notRunning);
      return;
    }
    const chosen =
      taskId !== undefined
        ? timer.on(taskId)
        : running.length === 1
          ? running[0]
          : await vscode.window
              .showQuickPick(
                running.map((entry) => ({
                  label: entry.title,
                  description: formatDuration(Date.now() - entry.startedAt),
                  entry,
                })),
                { title: t.time.pickToStop, ignoreFocusOut: true },
              )
              .then((picked) => picked?.entry);
    if (!chosen) {
      return;
    }
    const hours = formatDuration(Date.now() - chosen.startedAt);
    await logTimeFor(active, chosen, chosen.title, hours);
    await timer.stop(chosen.taskId);
    detail.refreshIfShowing(chosen.taskId);
  };

  command("proofhub.startTimer", async (node: Node) => {
    const active = await requireSession();
    if (!active || node?.kind !== "task") {
      return;
    }
    await startTimerOn({
      projectId: node.project.id,
      todolistId: node.todolist.id,
      taskId: node.task.id,
      title: node.task.title,
    });
  });

  command("proofhub.stopTimer", async (taskId?: Id) => {
    await stopTimerOn(taskId);
  });

  command("proofhub.logTime", async (node: Node) => {
    const active = await requireSession();
    if (!active || node?.kind !== "task") {
      return;
    }
    const hours = await vscode.window.showInputBox({
      title: t.time.logTitle(node.task.title),
      prompt: t.time.hoursPrompt,
      value: "1:00",
      ignoreFocusOut: true,
      validateInput: (value) =>
        HOURS_PATTERN.test(value.trim()) ? undefined : t.time.hoursInvalid,
    });
    if (!hours) {
      return;
    }
    await logTimeFor(
      active,
      { projectId: node.project.id, todolistId: node.todolist.id, taskId: node.task.id },
      node.task.title,
      hours.trim(),
    );
    detail.refreshIfShowing(node.task.id);
  });

  command("proofhub.myTasks", async () => {
    const active = await requireSession();
    if (!active) {
      return;
    }
    const mine = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t.mine.collecting,
        cancellable: true,
      },
      async (progress, token) => {
        const me = await whoAmI();
        const projects = await active.client.projects(false);
        const found: { label: string; description: string; node: Node }[] = [];

        for (const [index, project] of projects.entries()) {
          if (token.isCancellationRequested) {
            break;
          }
          progress.report({
            message: t.mine.progress(project.title, index + 1, projects.length),
            increment: 100 / Math.max(projects.length, 1),
          });
          for (const todolist of await active.client.todolists(project.id)) {
            if (token.isCancellationRequested) {
              break;
            }
            for (const task of await active.client.tasks(project.id, todolist.id)) {
              if (
                !task.completed &&
                (me ? (task.assigned ?? []).some((id) => sameId(id, me.id)) : task.by_me)
              ) {
                found.push({
                  label: task.title,
                  description: `${project.title} › ${todolist.title}`,
                  node: { kind: "task", project, todolist, task },
                });
              }
            }
          }
        }
        return found;
      },
    );

    if (mine.length === 0) {
      vscode.window.showInformationMessage(t.mine.none);
      return;
    }
    const picked = await vscode.window.showQuickPick(mine, {
      title: t.mine.title(mine.length),
      matchOnDescription: true,
    });
    if (picked) {
      await detail.show(picked.node);
    }
  });
}

async function moveViewToRight(): Promise<void> {
  await vscode.commands.executeCommand("proofhub.projects.focus");
  const available = new Set(await vscode.commands.getCommands(true));
  const move = [
    "workbench.action.moveFocusedViewToSecondarySideBar",
    "workbench.action.moveViewToSecondarySideBar",
  ].find((id) => available.has(id));
  if (!move) {
    vscode.window.showInformationMessage(t.layout.cannotMove);
    return;
  }
  await vscode.commands.executeCommand(move);
  await vscode.commands.executeCommand("proofhub.projects.focus");
}

function idMatches(candidate: Id, wanted: Id): boolean {
  return String(candidate).replace(/^\D+-/, "") === String(wanted).replace(/^\D+-/, "");
}

async function logTimeFor(
  session: Session,
  location: { projectId: Id; todolistId: Id; taskId: Id },
  taskTitle: string,
  hours: string,
): Promise<void> {
  const sheets = await session.client.timesheets(location.projectId);
  if (sheets.length === 0) {
    vscode.window.showWarningMessage(t.time.noTimesheet);
    return;
  }
  const sheet =
    sheets.length === 1
      ? sheets[0]
      : await vscode.window
          .showQuickPick(
            sheets.map((entry) => ({ label: entry.title, id: entry.id })),
            { title: t.time.timesheet, ignoreFocusOut: true },
          )
          .then((picked) => (picked ? { id: picked.id, title: picked.label } : undefined));
  if (!sheet) {
    return;
  }

  const description = await vscode.window.showInputBox({
    title: t.time.logTitle(taskTitle),
    prompt: t.time.whatPrompt,
    ignoreFocusOut: true,
  });
  if (description === undefined) {
    return;
  }

  const minutes = parseHours(hours);
  await session.client.logTime({
    project: location.projectId,
    timesheet_id: sheet.id,
    date: today(),
    logged_hours: String(Math.floor(minutes / 60)),
    logged_mins: String(minutes % 60),
    description: description.trim(),
    list_id: location.todolistId,
    task_id: location.taskId,
  });
  vscode.window.showInformationMessage(t.time.logged(hours, taskTitle));
}

export function deactivate(): void {}
