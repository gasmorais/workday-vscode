import { monthLabel } from "../format.js";
import { escapeHtml } from "../html.js";
import type { Bucket, Report } from "../report.js";
import { t } from "../strings.js";
import { button, empty, list, section } from "./ui.js";
import { columnChart, shareChart, weekdayLabel } from "./charts.js";

export function renderReport(
  report: Report,
  options: { onlyMine: boolean; goalMinutes?: number },
): string {
  return [
    "<header>",
    `<h1>${escapeHtml(t.report.title)}</h1>`,
    `<p class="actions">${button("toggleMine", options.onlyMine ? t.report.onlyMine : t.report.everyone)}${button(
      "refresh",
      t.detail.refresh,
    )}</p>`,
    "</header>",
    cards(report),
    section(
      t.report.days,
      undefined,
      report.days.length > 0
        ? columnChart(report.days, {
            goalMinutes: options.goalMinutes,
            labelOf: (bucket) => weekdayLabel(bucket.key),
          })
        : empty(t.report.noEntries),
    ),
    bars(t.report.weeks, report.weeks, (bucket) => t.report.week_of(dayLabel(bucket.key))),
    bars(t.report.months, report.months, (bucket) => monthLabel(bucket.key)),
    section(
      t.report.projects,
      undefined,
      report.projects.length > 0 ? shareChart(report.projects) : empty(t.report.noEntries),
    ),
    entries(report),
  ].join("\n");
}

function cards(report: Report): string {
  const items: [string, string][] = [
    [t.report.today, report.today],
    [t.report.week, report.week],
    [t.report.month, report.month],
    [t.report.total, report.total],
    [t.report.estimated, report.estimatedOpen],
  ];
  return `<div class="cards">${items
    .map(
      ([label, value]) =>
        `<div class="card"><span class="value">${escapeHtml(value)}</span><span class="label">${escapeHtml(
          label,
        )}</span></div>`,
    )
    .join("")}</div>`;
}

function bars(title: string, rows: Bucket[], labelOf: (bucket: Bucket) => string): string {
  if (rows.length === 0) {
    return section(title, undefined, empty(t.report.noEntries));
  }
  const peak = Math.max(...rows.map((row) => row.minutes), 1);
  const body = rows
    .map(
      (row) =>
        `<li><span class="bar-label">${escapeHtml(labelOf(row))}</span><span class="bar"><span style="width:${Math.round(
          (row.minutes / peak) * 100,
        )}%"></span></span><span class="hours">${escapeHtml(row.hours)}</span></li>`,
    )
    .join("");
  return section(title, undefined, `<ul class="list bars">${body}</ul>`);
}

function entries(report: Report): string {
  if (report.entries.length === 0) {
    return section(t.report.entries, undefined, empty(t.report.noEntries));
  }
  const rows = report.entries.slice(0, 60).map(
    (entry) =>
      `<li><span class="hours">${escapeHtml(entry.hours ?? "")}</span><span class="grow">${escapeHtml(
        entry.description ?? "",
      )}</span><span class="muted">${escapeHtml(entry.projectTitle ?? "")}</span><span class="muted">${escapeHtml(
        dayLabel(entry.logged_date ?? ""),
      )}</span></li>`,
  );
  return section(t.report.entries, String(report.entries.length), list("entries", rows));
}

export function dayLabel(key: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return match ? `${match[3]}/${match[2]}` : key;
}
