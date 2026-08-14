import { dayKey, formatMinutes, monthKey, weekKey } from "./format.js";
import { minutesOf as entryMinutes, type TimeEntry } from "./types.js";

export interface Logged extends TimeEntry {
  projectTitle?: string;
  taskTitle?: string;
  authorName?: string;
}

export type Grain = "day" | "week" | "month";

export interface Series {
  label: string;
  total: number;
  hours: string;
  values: number[];
}

export interface Comparison {
  keys: string[];
  series: Series[];
  totals: number[];
  peak: number;
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
  people: Bucket[];
  comparison: Comparison;
  grain: Grain;
  estimatedOpen: string;
  entries: Logged[];
}

const SPAN: Record<Grain, number> = { day: 14, week: 8, month: 12 };

export function keyOf(grain: Grain, value: string | undefined): string {
  return grain === "day" ? dayKey(value) : grain === "week" ? weekKey(value) : monthKey(value);
}

export function compare(entries: Logged[], grain: Grain, limit = SPAN[grain]): Comparison {
  const keys = [...new Set(entries.map((entry) => keyOf(grain, entry.date)).filter(Boolean))]
    .sort()
    .slice(-limit);
  const index = new Map(keys.map((key, position) => [key, position]));
  const byPerson = new Map<string, number[]>();
  for (const entry of entries) {
    const position = index.get(keyOf(grain, entry.date));
    if (position === undefined) {
      continue;
    }
    const label = entry.authorName ?? "";
    const values = byPerson.get(label) ?? new Array<number>(keys.length).fill(0);
    values[position] += entryMinutes(entry);
    byPerson.set(label, values);
  }
  const series = [...byPerson.entries()]
    .map(([label, values]) => {
      const total = values.reduce((sum, value) => sum + value, 0);
      return { label, total, hours: formatMinutes(total), values };
    })
    .sort((left, right) => right.total - left.total);
  const totals = keys.map((_, position) =>
    series.reduce((sum, row) => sum + row.values[position], 0),
  );
  return { keys, series, totals, peak: Math.max(...totals, 1) };
}

export function buildReport(
  entries: Logged[],
  options: {
    reference?: Date;
    estimatedOpenMinutes?: number;
    recentDays?: number;
    grain?: Grain;
  } = {},
): Report {
  const reference = options.reference ?? new Date();
  const todayKey = dayKey(reference.toISOString());
  const thisWeek = weekKey(reference.toISOString());
  const thisMonth = monthKey(reference.toISOString());

  const byDay = group(entries, (entry) => dayKey(entry.date));
  const byWeek = group(entries, (entry) => weekKey(entry.date));
  const byMonth = group(entries, (entry) => monthKey(entry.date));
  const byProject = group(entries, (entry) => entry.projectTitle ?? "");
  const byPerson = group(entries, (entry) => entry.authorName ?? "");
  const grain = options.grain ?? "day";

  const recent = options.recentDays ?? 14;
  return {
    today: formatMinutes(byDay.get(todayKey) ?? 0),
    week: formatMinutes(byWeek.get(thisWeek) ?? 0),
    month: formatMinutes(byMonth.get(thisMonth) ?? 0),
    total: formatMinutes(totalMinutes(entries)),
    days: buckets(byDay).slice(0, recent),
    weeks: buckets(byWeek).slice(0, 8),
    months: buckets(byMonth).slice(0, 12),
    projects: buckets(byProject, false).filter((bucket) => bucket.key !== ""),
    people: buckets(byPerson, false).filter((bucket) => bucket.key !== ""),
    comparison: compare(entries, grain),
    grain,
    estimatedOpen: formatMinutes(options.estimatedOpenMinutes ?? 0),
    entries: [...entries].sort((left, right) =>
      String(right.date ?? "").localeCompare(String(left.date ?? "")),
    ),
  };
}

export function totalMinutes(entries: TimeEntry[]): number {
  return entries.reduce((total, entry) => total + entryMinutes(entry), 0);
}

function group(entries: Logged[], keyOf: (entry: Logged) => string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const key = keyOf(entry);
    totals.set(key, (totals.get(key) ?? 0) + entryMinutes(entry));
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
