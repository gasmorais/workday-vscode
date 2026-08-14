export function parseHours(value: string | number | undefined): number {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  const text = String(value).trim();
  const match = /^(\d{1,4}):([0-5]\d)$/.exec(text);
  if (match) {
    return Number(match[1]) * 60 + Number(match[2]);
  }
  const decimal = Number(text.replace(",", "."));
  return Number.isFinite(decimal) ? Math.round(decimal * 60) : 0;
}

export function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function sumHours(entries: { hours?: string }[]): string {
  return formatMinutes(entries.reduce((total, entry) => total + parseHours(entry.hours), 0));
}

export function formatWhen(value: string | undefined): string {
  const date = toDate(value);
  if (!date) {
    return value ?? "";
  }
  return `${date.toISOString().slice(8, 10)}/${date.toISOString().slice(5, 7)} ${date
    .toISOString()
    .slice(11, 16)}`;
}

export function toDate(value: string | number | null | undefined): Date | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const text = String(value);
  const date = new Date(/^\d{9,}$/.test(text) ? Number(text) * 1000 : text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function dayKey(value: string | number | null | undefined): string {
  return toDate(value)?.toISOString().slice(0, 10) ?? "";
}

export function monthKey(value: string | number | null | undefined): string {
  return dayKey(value).slice(0, 7);
}

export function weekKey(value: string | number | null | undefined): string {
  const date = toDate(value);
  if (!date) {
    return "";
  }
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

export function monthLabel(key: string): string {
  const months = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  const [year, month] = key.split("-");
  const name = months[Number(month) - 1];
  return name ? `${name} de ${year}` : key;
}
