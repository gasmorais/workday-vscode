import { escapeHtml } from "../html.js";
import { t } from "../locales/index.js";
import { formatMinutes, toDate } from "../format.js";
import type { Bucket } from "../report.js";

export function columnChart(
  rows: Bucket[],
  options: { goalMinutes?: number; labelOf?: (bucket: Bucket) => string } = {},
): string {
  if (rows.length === 0) {
    return "";
  }
  const ordered = [...rows].reverse();
  const goal = options.goalMinutes ?? 0;
  const peak = Math.max(...ordered.map((row) => row.minutes), goal, 1);
  const columns = ordered
    .map((row) => {
      const height = Math.round((row.minutes / peak) * 100);
      const label = options.labelOf ? options.labelOf(row) : row.label;
      const tone = goal > 0 && row.minutes >= goal ? " reached" : "";
      return `<div class="col" title="${escapeHtml(`${label}: ${row.hours}`)}">
<span class="col-value">${escapeHtml(row.minutes > 0 ? row.hours : "")}</span>
<div class="col-track"><div class="col-bar${tone}" style="height:${height}%"></div></div>
<span class="col-key">${escapeHtml(label)}</span></div>`;
    })
    .join("");
  const line =
    goal > 0
      ? `<div class="goal" style="bottom:${Math.round((goal / peak) * 100)}%"><span>${escapeHtml(
          formatMinutes(goal),
        )}</span></div>`
      : "";
  return `<div class="columns"><div class="plot">${line}${columns}</div></div>`;
}

export function shareChart(rows: Bucket[]): string {
  const total = rows.reduce((sum, row) => sum + row.minutes, 0);
  if (total === 0) {
    return "";
  }
  const stack = rows
    .map(
      (row, index) =>
        `<span class="slice tone${index % 6}" style="width:${(row.minutes / total) * 100}%" title="${escapeHtml(
          `${row.label}: ${row.hours}`,
        )}"></span>`,
    )
    .join("");
  const legend = rows
    .map(
      (row, index) =>
        `<li><span class="dot tone${index % 6}"></span><span class="grow">${escapeHtml(
          row.label,
        )}</span><span class="hours">${escapeHtml(row.hours)}</span><span class="muted">${Math.round(
          (row.minutes / total) * 100,
        )}%</span></li>`,
    )
    .join("");
  return `<div class="stack">${stack}</div><ul class="list legend">${legend}</ul>`;
}

export function weekdayLabel(key: string): string {
  const date = toDate(key);
  if (!date) {
    return key;
  }
  return `${t.calendar.weekdays[date.getUTCDay()]} ${String(date.getUTCDate()).padStart(2, "0")}`;
}
