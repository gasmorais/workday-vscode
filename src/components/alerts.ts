import { escapeHtml } from "../html.js";
import { daysUntil, formatMinutes, shortDate } from "../format.js";
import { t } from "../locales/index.js";
import { estimateOf, minutesOf } from "../types.js";
import { button } from "./ui.js";
import type { TaskView } from "./sections.js";
import { LONG_TIMER_MS, NEAR_ESTIMATE_RATIO } from "../constants.js";

export type AlertLevel = "danger" | "warn" | "info";

export interface Alert {
  level: AlertLevel;
  title: string;
  text: string;
  actions: string;
}

function card(alert: Alert): string {
  return [
    `<div class="alert ${alert.level}">`,
    `<div class="alert-body"><p class="alert-title">${escapeHtml(alert.title)}</p>`,
    `<p class="alert-text">${escapeHtml(alert.text)}</p></div>`,
    alert.actions ? `<div class="alert-actions">${alert.actions}</div>` : "",
    "</div>",
  ].join("");
}

export function alertsOf(view: TaskView, now = new Date()): Alert[] {
  const found: Alert[] = [];
  const done = Boolean(view.task.completed);
  const logged = minutesOf(view.task);
  const estimate = estimateOf(view.task);
  const totalLogged = view.time.reduce((sum, entry) => sum + minutesOf(entry), 0) || logged;
  const kind = view.isSubtask ? t.alerts.thisSubtask : t.alerts.thisTask;
  const timeAction =
    button(
      view.timerRunning ? "stopTimer" : "startTimer",
      view.timerRunning ? t.detail.stopTimer : t.detail.startTimer,
      { variant: "timer" },
    ) + button("focusTime", t.alerts.logNow, { variant: "ghost" });

  if (view.timerRunning && view.timerSince) {
    const elapsed = Math.max(0, now.getTime() - view.timerSince);
    const long = elapsed >= LONG_TIMER_MS;
    found.push({
      level: long ? "warn" : "info",
      title: t.alerts.runningTitle,
      text: long
        ? t.alerts.runningLong(formatMinutes(Math.round(elapsed / 60000)))
        : t.alerts.runningText(formatMinutes(Math.round(elapsed / 60000))),
      actions: button("stopTimer", t.detail.stopTimer, { variant: "timer running" }),
    });
  }

  if (!done && view.task.due_date) {
    const days = daysUntil(view.task.due_date, now);
    const label = shortDate(view.task.due_date, now);
    if (days !== undefined && days < 0) {
      found.push({
        level: "danger",
        title: t.alerts.overdueTitle,
        text: t.alerts.overdueText(kind, -days, label),
        actions:
          button("complete", t.detail.complete, { variant: "primary" }) +
          button("open", t.detail.openBrowser, { variant: "ghost" }),
      });
    } else if (days === 0) {
      found.push({
        level: "warn",
        title: t.alerts.todayTitle,
        text: t.alerts.todayText(kind),
        actions: button("complete", t.detail.complete, { variant: "primary" }),
      });
    } else if (days === 1) {
      found.push({
        level: "warn",
        title: t.alerts.tomorrowTitle,
        text: t.alerts.tomorrowText(kind, label),
        actions: "",
      });
    }
  }

  if (!view.timerRunning && totalLogged === 0) {
    found.push({
      level: done ? "warn" : "info",
      title: t.alerts.noTimeTitle,
      text: done ? t.alerts.noTimeDone(kind) : t.alerts.noTimeText(kind),
      actions: timeAction,
    });
  }

  if (estimate > 0 && totalLogged > estimate) {
    found.push({
      level: "danger",
      title: t.alerts.overEstimateTitle,
      text: t.alerts.overEstimateText(
        formatMinutes(estimate),
        formatMinutes(totalLogged - estimate),
      ),
      actions: button("open", t.detail.openBrowser, { variant: "ghost" }),
    });
  } else if (estimate > 0 && totalLogged >= estimate * NEAR_ESTIMATE_RATIO && !done) {
    found.push({
      level: "warn",
      title: t.alerts.nearEstimateTitle,
      text: t.alerts.nearEstimateText(
        formatMinutes(estimate),
        Math.round((totalLogged / estimate) * 100),
      ),
      actions: "",
    });
  }

  if (!done && estimate === 0 && totalLogged > 0) {
    found.push({
      level: "info",
      title: t.alerts.noEstimateTitle,
      text: t.alerts.noEstimateText(kind, formatMinutes(totalLogged)),
      actions: button("open", t.detail.openBrowser, { variant: "ghost" }),
    });
  }

  if (!done && view.assignees.length === 0) {
    found.push({
      level: "info",
      title: t.alerts.noOwnerTitle,
      text: t.alerts.noOwnerText(kind),
      actions: button("open", t.detail.openBrowser, { variant: "ghost" }),
    });
  }

  return found;
}

export function alerts(view: TaskView, now = new Date()): string {
  const found = alertsOf(view, now);
  return found.length > 0 ? `<div class="alerts">${found.map(card).join("")}</div>` : "";
}
