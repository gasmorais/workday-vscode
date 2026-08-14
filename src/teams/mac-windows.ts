export const CALL_WINDOW_PATTERN =
  "compact view|^Meeting\\b|^Reuni[aã]o\\b|^Call\\b|^Chamada\\b|^Liga[cç][aã]o\\b";

export interface CallWindow {
  inCall: boolean;
  title?: string;
}

function segments(name: string): string[] {
  return name
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function titleOf(name: string): string | undefined {
  const parts = segments(name).filter((part) => part !== "Microsoft Teams");
  const named = parts.filter((part) => !/compact view/i.test(part));
  return named.length > 0 ? named[named.length - 1] : undefined;
}

export function readWindows(names: string[], pattern: string): CallWindow {
  const test = new RegExp(pattern, "i");
  const hit = names.find((name) => segments(name).some((part) => test.test(part)));
  return hit ? { inCall: true, title: titleOf(hit) } : { inCall: false };
}

export const WINDOW_SEPARATOR = "\u001f";

export function parseWindowList(output: string): string[] {
  return output
    .split(WINDOW_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
}
