import { escapeHtml } from "../html.js";

export function section(title: string, count: string | undefined, body: string): string {
  const badge = count ? ` <span class="count">${escapeHtml(count)}</span>` : "";
  return `<section><h2>${escapeHtml(title)}${badge}</h2>${body}</section>`;
}

export function empty(text: string): string {
  return `<p class="empty">${escapeHtml(text)}</p>`;
}

export type Tone = "neutral" | "quiet" | "accent" | "ok" | "warn" | "danger";

export function chip(text: string, tone: Tone = "neutral", title?: string): string {
  if (!text) {
    return "";
  }
  const hint = title ? ` title="${escapeHtml(title)}"` : "";
  return `<span class="chip ${tone}"${hint}>${escapeHtml(text)}</span>`;
}

export type Variant = "primary" | "ghost" | "timer" | "timer running" | "as-link";

export function button(
  action: string,
  label: string,
  options: { id?: string | number; variant?: Variant; title?: string } = {},
): string {
  const target = options.id === undefined ? "" : ` data-id="${escapeHtml(options.id)}"`;
  const variant = options.variant ? ` class="${options.variant}"` : "";
  const hint = options.title ? ` title="${escapeHtml(options.title)}"` : "";
  return `<button${variant} data-act="${escapeHtml(action)}"${target}${hint}>${escapeHtml(
    label,
  )}</button>`;
}

export function linkButton(action: string, label: string, id: string | number): string {
  return button(action, label, { id, variant: "as-link" });
}

export function list(className: string, items: string[]): string {
  return `<ul class="list ${className}">${items.join("")}</ul>`;
}

export function field(attributes: Record<string, string>): string {
  const rendered = Object.entries(attributes)
    .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
    .join(" ");
  return `<input ${rendered}>`;
}

export function form(name: string, body: string, submit: string): string {
  return `<form data-form="${escapeHtml(name)}">${body}<button type="submit">${escapeHtml(
    submit,
  )}</button></form>`;
}
