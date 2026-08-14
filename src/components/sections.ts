import { escapeHtml, richText } from "../html.js";
import { t } from "../locales/index.js";
import {
  estimateOf as estimateMinutes,
  minutesOf,
  type Comment,
  type Subtask,
  type Task,
  type TimeEntry,
} from "../types.js";
import { daysUntil, formatMinutes, formatWhen, shortDate } from "../format.js";
import { button, chip, empty, field, form, linkButton, list, section } from "./ui.js";
import { alerts } from "./alerts.js";
import { HOURS_PATTERN } from "../constants.js";

export type LoggedEntry = TimeEntry & { authorName?: string; targetTitle?: string };

export interface TaskView {
  projectTitle: string;
  todolistTitle: string;
  task: Task;
  assignees: string[];
  subtasks: Subtask[];
  comments: (Comment & { authorName?: string })[];
  time: LoggedEntry[];
  timerRunning: boolean;
  timerSince?: number;
  isSubtask?: boolean;
  parentTitle?: string;
  problems?: { subtasks?: string; comments?: string; time?: string };
}

export function header(view: TaskView): string {
  const done = Boolean(view.task.completed);
  const actions = [
    button(
      view.timerRunning ? "stopTimer" : "startTimer",
      view.timerRunning ? t.detail.stopTimer : t.detail.startTimer,
      { variant: view.timerRunning ? "timer running" : "timer", title: t.detail.timerHint },
    ),
    button("focusTime", t.alerts.logNow, { variant: "ghost" }),
    button(done ? "reopen" : "complete", done ? t.detail.reopen : t.detail.complete, {
      variant: "ghost",
    }),
    button("open", t.detail.openBrowser, { variant: "ghost" }),
    button("refresh", t.detail.refresh, { variant: "ghost" }),
  ];
  if (view.isSubtask) {
    actions.unshift(button("back", t.detail.back, { variant: "ghost" }));
  }
  const crumbs = [view.projectTitle, view.todolistTitle, view.parentTitle]
    .filter(Boolean)
    .map((part) => escapeHtml(part as string))
    .join(" › ");
  return [
    "<header>",
    `<p class="crumbs">${crumbs}</p>`,
    `<h1 class="${done ? "done" : ""}">${escapeHtml(view.task.title)}</h1>`,
    `<p class="meta">${chips(view)}</p>`,
    `<p class="actions">${actions.join("")}</p>`,
    "</header>",
  ].join("");
}

export function dueChip(
  due: string | null | undefined,
  completed?: boolean,
  now = new Date(),
): string {
  if (!due) {
    return "";
  }
  const days = daysUntil(due, now);
  const label = shortDate(due, now);
  if (completed || days === undefined) {
    return chip(t.detail.due(label), "quiet", String(due));
  }
  if (days < 0) {
    return chip(t.detail.overdue(label, -days), "danger", String(due));
  }
  if (days === 0) {
    return chip(t.detail.dueToday, "warn", String(due));
  }
  if (days === 1) {
    return chip(t.detail.dueTomorrow, "warn", String(due));
  }
  return chip(t.detail.due(label), days <= 7 ? "neutral" : "quiet", String(due));
}

function chips(view: TaskView, now = new Date()): string {
  const done = Boolean(view.task.completed);
  const parts = [chip(done ? t.detail.status.done : t.detail.status.open, done ? "ok" : "accent")];
  if (view.timerRunning) {
    parts.push(chip(t.detail.timerOn, "warn"));
  }
  for (const person of view.assignees) {
    parts.push(chip(person, "neutral"));
  }
  parts.push(dueChip(view.task.due_date, done, now));
  const estimate = estimateOf(view.task);
  const logged = minutesOf(view.task);
  if (estimate) {
    parts.push(chip(t.detail.estimate(estimate), "quiet"));
  }
  if (logged > 0) {
    const over = estimate ? minutesOf(view.task) > estimateMinutes(view.task) : false;
    parts.push(chip(t.detail.logged(formatMinutes(logged)), over ? "danger" : "quiet"));
  }
  return parts.filter(Boolean).join("");
}

function estimateOf(task: Task): string {
  const minutes = estimateMinutes(task);
  return minutes > 0 ? formatMinutes(minutes) : "";
}

export function description(task: Task): string {
  const body = richText(task.description ?? "");
  return section(
    t.detail.description,
    undefined,
    body ? `<div class="prose">${body}</div>` : empty(t.detail.noDescription),
  );
}

export function subtasks(items: Subtask[], problem?: string): string {
  const rows = items.map(
    (item) =>
      `<li><input type="checkbox" data-subtask="${escapeHtml(item.id)}"${
        item.completed ? " checked" : ""
      }><span class="grow">${linkButton("openSubtask", item.title, String(item.id)).replace(
        'class="as-link"',
        `class="as-link${item.completed ? " done" : ""}"`,
      )}</span>${dueChip(
        item.due_date,
        item.completed,
      )}${minutesOf(item) > 0 ? chip(formatMinutes(minutesOf(item)), "quiet") : ""}${
        item.assigned?.length ? chip(t.tree.people(item.assigned.length), "quiet") : ""
      }</li>`,
  );
  const done = items.filter((item) => item.completed).length;
  return section(
    t.detail.subtasks,
    items.length > 0 ? `${done}/${items.length}` : undefined,
    (rows.length > 0
      ? list("subtasks", rows)
      : empty(problem ? t.common.sectionFailed(problem) : t.detail.noSubtasks)) +
      form(
        "subtask",
        field({ name: "title", placeholder: t.detail.newSubtask, autocomplete: "off" }),
        t.detail.add,
      ),
  );
}

export function time(entries: LoggedEntry[], problem?: string): string {
  const rows = entries.map(
    (entry) =>
      `<li><span class="hours">${escapeHtml(formatMinutes(minutesOf(entry)))}</span><span class="grow">${escapeHtml(
        entry.description || t.detail.noNote,
      )}${
        entry.targetTitle
          ? `<span class="muted"> ${escapeHtml(t.detail.onSubtask(entry.targetTitle))}</span>`
          : ""
      }</span><span class="who-inline">${escapeHtml(entry.authorName ?? "")}</span>${
        entry.status === "billable" ? chip(t.detail.billableShort, "ok", t.detail.billable) : ""
      }${chip(shortDate(entry.date), "quiet", String(entry.date ?? ""))}</li>`,
  );
  return section(
    t.detail.time,
    entries.length > 0
      ? formatMinutes(entries.reduce((total, entry) => total + minutesOf(entry), 0))
      : undefined,
    (rows.length > 0
      ? list("time", rows)
      : empty(problem ? t.common.sectionFailed(problem) : t.detail.noTime)) +
      form(
        "time",
        field({
          name: "hours",
          value: "1:00",
          size: "5",
          pattern: HOURS_PATTERN.source.slice(1, -1),
        }) +
          field({
            name: "description",
            placeholder: t.detail.whatPlaceholder,
            autocomplete: "off",
          }),
        t.detail.logHours,
      ),
  );
}

export function comments(items: (Comment & { authorName?: string })[], problem?: string): string {
  const rows = items.map((item) => {
    const when = formatWhen(item.created_at);
    return `<li><p class="who">${escapeHtml(item.authorName ?? t.detail.someone)}${
      when ? chip(when, "quiet", String(item.created_at ?? "")) : ""
    }</p><div class="prose">${richText(item.description)}</div></li>`;
  });
  return section(
    t.detail.comments,
    items.length > 0 ? String(items.length) : undefined,
    (rows.length > 0
      ? list("comments", rows)
      : empty(problem ? t.common.sectionFailed(problem) : t.detail.noComments)) +
      form(
        "comment",
        `<textarea name="content" rows="3" placeholder="${escapeHtml(
          t.detail.writeComment,
        )}"></textarea>`,
        t.detail.comment,
      ) +
      `<p class="hint">${escapeHtml(t.detail.sendHint)}</p>`,
  );
}

export function renderBody(view: TaskView): string {
  return [
    header(view),
    alerts(view),
    description(view.task),
    view.isSubtask ? "" : subtasks(view.subtasks, view.problems?.subtasks),
    time(view.time, view.problems?.time),
    comments(view.comments, view.problems?.comments),
  ].join("\n");
}
