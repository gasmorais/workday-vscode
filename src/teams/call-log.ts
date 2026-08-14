export interface CallRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  minutes: number;
  title?: string;
  loggedHours?: string;
  taskTitle?: string;
}

export const CALL_LOG_LIMIT = 200;

export function idOf(startedAt: number): string {
  return `call-${startedAt}`;
}

export function add(records: CallRecord[], record: CallRecord): CallRecord[] {
  const rest = records.filter((entry) => entry.id !== record.id);
  return [record, ...rest].slice(0, CALL_LOG_LIMIT);
}

export function mark(
  records: CallRecord[],
  id: string,
  loggedHours: string,
  taskTitle: string,
): CallRecord[] {
  return records.map((entry) => (entry.id === id ? { ...entry, loggedHours, taskTitle } : entry));
}

export function drop(records: CallRecord[], id: string): CallRecord[] {
  return records.filter((entry) => entry.id !== id);
}

export function pending(records: CallRecord[]): CallRecord[] {
  return records.filter((entry) => !entry.loggedHours);
}

export function sameDay(at: number, reference: number): boolean {
  const left = new Date(at);
  const right = new Date(reference);
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function since(records: CallRecord[], days: number, now: number): CallRecord[] {
  const floor = now - days * 24 * 60 * 60 * 1000;
  return records
    .filter((entry) => entry.endedAt >= floor)
    .sort((a, b) => b.startedAt - a.startedAt);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function clockOf(at: number): string {
  const when = new Date(at);
  return `${pad(when.getHours())}:${pad(when.getMinutes())}`;
}

export function rangeOf(record: CallRecord): string {
  return `${clockOf(record.startedAt)} - ${clockOf(record.endedAt)}`;
}

export function totalMinutes(records: CallRecord[]): number {
  return records.reduce((sum, entry) => sum + entry.minutes, 0);
}
