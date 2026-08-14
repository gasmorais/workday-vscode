import { dayKey, formatMinutes, monthKey, parseHours, weekKey } from "./format.js";
import type { TimeEntry } from "./types.js";

export interface Logged extends TimeEntry {
  projectTitle?: string;
  taskTitle?: string;
}

export interface Bucket {
  key: string;
  label: string;
  minutes: number;
  hours: string;
}

export interface Report {
  today: string;
  week: string;
  month: string;
  total: string;
  days: Bucket[];
  weeks: Bucket[];
  months: Bucket[];
  projects: Bucket[];
  estimatedOpen: string;
  entries: Logged[];
}

export function buildReport(
  entries: Logged[],
  options: { reference?: Date; estimatedOpenMinutes?: number; recentDays?: number } = {},
): Report {
  const reference = options.reference ?? new Date();
  const todayKey = dayKey(reference.toISOString());
  const thisWeek = weekKey(reference.toISOString());
  const thisMonth = monthKey(reference.toISOString());

  const byDay = group(entries, (entry) => dayKey(entry.logged_date));
  const byWeek = group(entries, (entry) => weekKey(entry.logged_date));
  const byMonth = group(entries, (entry) => monthKey(entry.logged_date));
  const byProject = group(entries, (entry) => entry.projectTitle ?? "");

  const recent = options.recentDays ?? 14;
  return {
    today: formatMinutes(byDay.get(todayKey) ?? 0),
    week: formatMinutes(byWeek.get(thisWeek) ?? 0),
    month: formatMinutes(byMonth.get(thisMonth) ?? 0),
    total: formatMinutes(minutesOf(entries)),
    days: buckets(byDay).slice(0, recent),
    weeks: buckets(byWeek).slice(0, 8),
    months: buckets(byMonth).slice(0, 12),
    projects: buckets(byProject, false).filter((bucket) => bucket.key !== ""),
    estimatedOpen: formatMinutes(options.estimatedOpenMinutes ?? 0),
    entries: [...entries].sort((left, right) =>
      String(right.logged_date ?? "").localeCompare(String(left.logged_date ?? "")),
    ),
  };
}

export function minutesOf(entries: { hours?: string }[]): number {
  return entries.reduce((total, entry) => total + parseHours(entry.hours), 0);
}

function group(entries: Logged[], keyOf: (entry: Logged) => string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const key = keyOf(entry);
    totals.set(key, (totals.get(key) ?? 0) + parseHours(entry.hours));
  }
  return totals;
}

function buckets(totals: Map<string, number>, byKeyDesc = true): Bucket[] {
  const rows = [...totals.entries()].map(([key, minutes]) => ({
    key,
    label: key,
    minutes,
    hours: formatMinutes(minutes),
  }));
  rows.sort((left, right) =>
    byKeyDesc ? right.key.localeCompare(left.key) : right.minutes - left.minutes,
  );
  return rows;
}
