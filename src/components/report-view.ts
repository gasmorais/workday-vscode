import { formatMinutes, monthLabel } from "../format.js";
import { minutesOf } from "../types.js";
import { escapeHtml } from "../html.js";
import type { Bucket, Grain, Report } from "../report.js";
import { t } from "../locales/index.js";
import { button, chip, empty, list, section } from "./ui.js";
import { columnChart, shareChart, stackedChart, weekdayLabel } from "./charts.js";

export function renderReport(
  report: Report,
  options: { scope: string; goalMinutes?: number },
): string {
  return [
    "<header>",
    `<h1>${escapeHtml(t.report.title)}</h1>`,
    `<p class="meta">${chip(options.scope, "accent")}</p>`,
    `<p class="actions">${button("people", t.report.choosePeople, { variant: "ghost" })}${button(
      "mine",
      t.report.onlyMine,
      { variant: "ghost" },
    )}${button("everyone", t.report.everyone, { variant: "ghost" })}${button(
      "refresh",
      t.detail.refresh,
      {
        variant: "ghost",
      },
    )}</p>`,
    "</header>",
    cards(report),
    comparison(report, options.goalMinutes),
    section(
      t.report.people,
      report.people.length > 0 ? String(report.people.length) : undefined,
      report.people.length > 0 ? shareChart(report.people) : empty(t.report.noEntries),
    ),
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

const GRAINS: Grain[] = ["day", "week", "month"];

function comparison(report: Report, goalMinutes?: number): string {
  const tabs = GRAINS.map((grain) =>
    button(`grain:${grain}`, t.report.grain[grain], {
      variant: grain === report.grain ? "primary" : "ghost",
    }),
  ).join("");
  const chart = stackedChart(report.comparison, {
    goalMinutes: report.grain === "day" ? goalMinutes : undefined,
    labelOf: (key) =>
      report.grain === "day"
        ? weekdayLabel(key)
        : report.grain === "week"
          ? t.report.week_of(dayLabel(key))
          : monthLabel(key),
  });
  return section(
    t.report.comparison,
    undefined,
    `<p class="actions tabs">${tabs}</p>` + (chart || empty(t.report.noEntries)),
  );
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
  const rows = report.entries
    .slice(0, 60)
    .map(
      (entry) =>
        `<li><span class="hours">${escapeHtml(formatMinutes(minutesOf(entry)))}</span><span class="grow">${escapeHtml(
          entry.description ?? "",
        )}</span><span class="who-inline">${escapeHtml(entry.authorName ?? "")}</span><span class="muted">${escapeHtml(
          entry.projectTitle ?? "",
        )}</span><span class="muted">${escapeHtml(dayLabel(entry.date ?? ""))}</span></li>`,
    );
  return section(t.report.entries, String(report.entries.length), list("entries", rows));
}

export function dayLabel(key: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return match ? `${match[3]}/${match[2]}` : key;
}
