import { escapeHtml } from "../html.js";

export function section(title: string, count: string | undefined, body: string): string {
  const badge = count ? ` <span class="count">${escapeHtml(count)}</span>` : "";
  return `<section><h2>${escapeHtml(title)}${badge}</h2>${body}</section>`;
}

export function empty(text: string): string {
  return `<p class="empty">${escapeHtml(text)}</p>`;
}

export function chip(text: string, tone: "" | "ok" | "open" = ""): string {
  return `<span class="chip ${tone}">${escapeHtml(text)}</span>`;
}

export function button(action: string, label: string, id?: string | number): string {
  const target = id === undefined ? "" : ` data-id="${escapeHtml(id)}"`;
  return `<button data-act="${escapeHtml(action)}"${target}>${escapeHtml(label)}</button>`;
}

export function linkButton(action: string, label: string, id: string | number): string {
  return `<button class="as-link" data-act="${escapeHtml(action)}" data-id="${escapeHtml(
    id,
  )}">${escapeHtml(label)}</button>`;
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
