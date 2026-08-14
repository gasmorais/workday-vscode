import { escapeHtml, richText } from "../html.js";
import { t } from "../strings.js";
import type { Comment, Subtask, Task, TimeEntry } from "../types.js";
import { formatWhen, sumHours } from "../format.js";
import { button, chip, empty, field, form, list, section } from "./ui.js";

export interface TaskView {
  projectTitle: string;
  todolistTitle: string;
  task: Task;
  assignees: string[];
  subtasks: Subtask[];
  comments: (Comment & { authorName?: string })[];
  time: TimeEntry[];
  timerRunning: boolean;
}

export function header(view: TaskView): string {
  const done = Boolean(view.task.completed);
  const actions = [
    button(done ? "reopen" : "complete", done ? t.detail.reopen : t.detail.complete),
    button(
      view.timerRunning ? "stopTimer" : "startTimer",
      view.timerRunning ? t.detail.stopTimer : t.detail.startTimer,
    ),
    button("open", t.detail.openBrowser),
    button("refresh", t.detail.refresh),
  ];
  return [
    "<header>",
    `<p class="crumbs">${escapeHtml(view.projectTitle)} › ${escapeHtml(view.todolistTitle)}</p>`,
    `<h1 class="${done ? "done" : ""}">${escapeHtml(view.task.title)}</h1>`,
    `<p class="meta">${chips(view)}</p>`,
    `<p class="actions">${actions.join("")}</p>`,
    "</header>",
  ].join("");
}

function chips(view: TaskView): string {
  const done = Boolean(view.task.completed);
  const parts = [chip(done ? t.detail.status.done : t.detail.status.open, done ? "ok" : "open")];
  if (view.assignees.length > 0) {
    parts.push(chip(view.assignees.join(", ")));
  }
  if (view.task.due_date) {
    parts.push(chip(t.detail.due(view.task.due_date)));
  }
  const estimate = estimateOf(view.task);
  if (estimate) {
    parts.push(chip(t.detail.estimate(estimate)));
  }
  return parts.join("");
}

function estimateOf(task: Task): string {
  const minutes = (task.estimated_hours ?? 0) * 60 + (task.estimated_mins ?? 0);
  return minutes > 0 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}` : "";
}

export function description(task: Task): string {
  const body = richText(task.description ?? "");
  return section(
    t.detail.description,
    undefined,
    body ? `<div class="prose">${body}</div>` : empty(t.detail.noDescription),
  );
}

export function subtasks(items: Subtask[]): string {
  const rows = items.map(
    (item) =>
      `<li><label><input type="checkbox" data-subtask="${escapeHtml(item.id)}"${
        item.completed ? " checked" : ""
      }><span class="${item.completed ? "done" : ""}">${escapeHtml(item.title)}</span></label>${
        item.due_date ? chip(item.due_date) : ""
      }</li>`,
  );
  const done = items.filter((item) => item.completed).length;
  return section(
    t.detail.subtasks,
    items.length > 0 ? `${done}/${items.length}` : undefined,
    (rows.length > 0 ? list("subtasks", rows) : empty(t.detail.noSubtasks)) +
      form(
        "subtask",
        field({ name: "title", placeholder: t.detail.newSubtask, autocomplete: "off" }),
        t.detail.add,
      ),
  );
}

export function time(entries: TimeEntry[]): string {
  const rows = entries.map(
    (entry) =>
      `<li><span class="hours">${escapeHtml(entry.hours ?? "")}</span><span>${escapeHtml(
        entry.description ?? "",
      )}</span>${entry.logged_date ? chip(entry.logged_date) : ""}</li>`,
  );
  return section(
    t.detail.time,
    entries.length > 0 ? sumHours(entries) : undefined,
    (rows.length > 0 ? list("time", rows) : empty(t.detail.noTime)) +
      form(
        "time",
        field({ name: "hours", value: "1:00", size: "5", pattern: "\\d{1,3}:[0-5]\\d" }) +
          field({
            name: "description",
            placeholder: t.detail.whatPlaceholder,
            autocomplete: "off",
          }),
        t.detail.logHours,
      ),
  );
}

export function comments(items: (Comment & { authorName?: string })[]): string {
  const rows = items.map((item) => {
    const when = formatWhen(item.created_at);
    return `<li><p class="who">${escapeHtml(item.authorName ?? item.created_by ?? "")}${
      when ? chip(when) : ""
    }</p><div class="prose">${richText(item.content ?? "")}</div></li>`;
  });
  return section(
    t.detail.comments,
    items.length > 0 ? String(items.length) : undefined,
    (rows.length > 0 ? list("comments", rows) : empty(t.detail.noComments)) +
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
    description(view.task),
    subtasks(view.subtasks),
    time(view.time),
    comments(view.comments),
  ].join("\n");
}
