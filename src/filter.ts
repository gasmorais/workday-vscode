import { plainText } from "./html.js";
import { toDate } from "./format.js";
import type { Task } from "./types.js";

export type SortKey = "list" | "due" | "title" | "assigned";

export interface TaskFilter {
  text: string;
  mine: boolean;
  hideCompleted: boolean;
  overdueOnly: boolean;
  meId?: string;
}

export const EMPTY_FILTER: TaskFilter = {
  text: "",
  mine: false,
  hideCompleted: false,
  overdueOnly: false,
};

export function isActive(filter: TaskFilter): boolean {
  return Boolean(filter.text.trim()) || filter.mine || filter.hideCompleted || filter.overdueOnly;
}

export function matches(task: Task, filter: TaskFilter, reference = new Date()): boolean {
  if (filter.hideCompleted && task.completed) {
    return false;
  }
  if (filter.mine) {
    const mine = (task.assigned ?? []).map(String);
    if (!filter.meId || !mine.includes(String(filter.meId))) {
      return false;
    }
  }
  if (filter.overdueOnly) {
    const due = toDate(task.due_date);
    if (task.completed || !due || due.getTime() >= startOfDay(reference).getTime()) {
      return false;
    }
  }
  const text = filter.text.trim().toLowerCase();
  if (text) {
    const haystack = [task.title, plainText(task.description ?? "")].join(" ").toLowerCase();
    if (!text.split(/\s+/).every((term) => haystack.includes(term))) {
      return false;
    }
  }
  return true;
}

export function applyFilter(tasks: Task[], filter: TaskFilter, reference = new Date()): Task[] {
  return tasks.filter((task) => matches(task, filter, reference));
}

export function sortTasks(tasks: Task[], key: SortKey): Task[] {
  if (key === "list") {
    return tasks;
  }
  const sorted = [...tasks];
  sorted.sort((left, right) => {
    if (key === "title") {
      return left.title.localeCompare(right.title, "pt-BR");
    }
    if (key === "assigned") {
      return (left.assigned?.length ?? 0) - (right.assigned?.length ?? 0) || left.title.localeCompare(right.title, "pt-BR");
    }
    const leftDue = toDate(left.due_date)?.getTime();
    const rightDue = toDate(right.due_date)?.getTime();
    if (leftDue === rightDue) {
      return left.title.localeCompare(right.title, "pt-BR");
    }
    if (leftDue === undefined) {
      return 1;
    }
    if (rightDue === undefined) {
      return -1;
    }
    return leftDue - rightDue;
  });
  return sorted;
}

export function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
