import type { Comment, Subtask, Task, TimeEntry } from "./types.js";

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

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function sumHours(entries: { hours?: string }[]): string {
  const minutes = entries.reduce((total, entry) => total + parseHours(entry.hours), 0);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

export function parseHours(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const match = /^(\d{1,4}):([0-5]\d)$/.exec(value.trim());
  if (match) {
    return Number(match[1]) * 60 + Number(match[2]);
  }
  const decimal = Number(value);
  return Number.isFinite(decimal) ? Math.round(decimal * 60) : 0;
}

export function formatWhen(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const parsed = new Date(/^\d+$/.test(value) ? Number(value) * 1000 : value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString().slice(0, 16).replace("T", " ");
}

export function renderBody(view: TaskView): string {
  const { task } = view;
  const done = Boolean(task.completed);
  return [
    `<header>`,
    `<p class="crumbs">${escapeHtml(view.projectTitle)} › ${escapeHtml(view.todolistTitle)}</p>`,
    `<h1 class="${done ? "done" : ""}">${escapeHtml(task.title)}</h1>`,
    `<p class="meta">${renderChips(view)}</p>`,
    `<p class="actions">`,
    done
      ? `<button data-act="reopen">Reopen</button>`
      : `<button data-act="complete">Complete</button>`,
    view.timerRunning
      ? `<button data-act="stopTimer">Stop timer</button>`
      : `<button data-act="startTimer">Start timer</button>`,
    `<button data-act="open">Open in ProofHub</button>`,
    `<button data-act="refresh">Refresh</button>`,
    `</p>`,
    `</header>`,
    renderDescription(task),
    renderSubtasks(view.subtasks),
    renderTime(view.time),
    renderComments(view.comments),
  ].join("\n");
}

function renderChips(view: TaskView): string {
  const chips: string[] = [];
  chips.push(`<span class="chip ${view.task.completed ? "ok" : "open"}">${view.task.completed ? "completed" : "open"}</span>`);
  if (view.assignees.length > 0) {
    chips.push(`<span class="chip">${escapeHtml(view.assignees.join(", "))}</span>`);
  }
  if (view.task.due_date) {
    chips.push(`<span class="chip">due ${escapeHtml(view.task.due_date)}</span>`);
  }
  const estimate = estimateOf(view.task);
  if (estimate) {
    chips.push(`<span class="chip">est ${estimate}</span>`);
  }
  return chips.join(" ");
}

function estimateOf(task: Task): string {
  const minutes = (task.estimated_hours ?? 0) * 60 + (task.estimated_mins ?? 0);
  return minutes > 0 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}` : "";
}

function renderDescription(task: Task): string {
  const text = task.description?.trim();
  return section(
    "Description",
    text ? `<div class="prose">${escapeHtml(text).replace(/\n/g, "<br>")}</div>` : empty("No description."),
  );
}

function renderSubtasks(subtasks: Subtask[]): string {
  const rows = subtasks
    .map(
      (subtask) =>
        `<li><label><input type="checkbox" data-subtask="${escapeHtml(subtask.id)}" ${
          subtask.completed ? "checked" : ""
        }><span class="${subtask.completed ? "done" : ""}">${escapeHtml(subtask.title)}</span></label>${
          subtask.due_date ? `<span class="chip">${escapeHtml(subtask.due_date)}</span>` : ""
        }</li>`,
    )
    .join("");
  const doneCount = subtasks.filter((subtask) => subtask.completed).length;
  return section(
    `Subtasks${subtasks.length ? ` <span class="count">${doneCount}/${subtasks.length}</span>` : ""}`,
    (rows ? `<ul class="list">${rows}</ul>` : empty("No subtasks.")) +
      `<form data-form="subtask"><input name="title" placeholder="New subtask" autocomplete="off"><button type="submit">Add</button></form>`,
  );
}

function renderTime(entries: TimeEntry[]): string {
  const rows = entries
    .map(
      (entry) =>
        `<li><span class="hours">${escapeHtml(entry.hours ?? "")}</span><span>${escapeHtml(
          entry.description ?? "",
        )}</span><span class="chip">${escapeHtml(entry.logged_date ?? "")}</span></li>`,
    )
    .join("");
  return section(
    `Time${entries.length ? ` <span class="count">${sumHours(entries)}</span>` : ""}`,
    (rows ? `<ul class="list time">${rows}</ul>` : empty("No time logged on this task.")) +
      `<form data-form="time"><input name="hours" value="1:00" size="5" pattern="\\d{1,3}:[0-5]\\d"><input name="description" placeholder="What did you work on" autocomplete="off"><button type="submit">Log</button></form>`,
  );
}

function renderComments(comments: (Comment & { authorName?: string })[]): string {
  const rows = comments
    .map(
      (comment) =>
        `<li><p class="who">${escapeHtml(comment.authorName ?? comment.created_by ?? "")} <span class="chip">${escapeHtml(
          formatWhen(comment.created_at),
        )}</span></p><div class="prose">${escapeHtml(stripTags(comment.content ?? "")).replace(
          /\n/g,
          "<br>",
        )}</div></li>`,
    )
    .join("");
  return section(
    `Comments${comments.length ? ` <span class="count">${comments.length}</span>` : ""}`,
    (rows ? `<ul class="list comments">${rows}</ul>` : empty("No comments yet.")) +
      `<form data-form="comment"><textarea name="content" rows="3" placeholder="Write a comment"></textarea><button type="submit">Comment</button></form>`,
  );
}

export function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function section(title: string, content: string): string {
  return `<section><h2>${title}</h2>${content}</section>`;
}

function empty(text: string): string {
  return `<p class="empty">${escapeHtml(text)}</p>`;
}
