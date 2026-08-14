import { looksLikeKey } from "./client.js";

export interface WatchDeps {
  readClipboard: () => Promise<string>;
  validate: (key: string) => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  isCancelled: () => boolean;
}

export interface WatchOptions {
  baseline?: string;
  timeoutMs?: number;
  intervalMs?: number;
}

export type WatchResult =
  { status: "found"; key: string } | { status: "timeout" } | { status: "cancelled" };

export async function watchClipboardForKey(
  deps: WatchDeps,
  options: WatchOptions = {},
): Promise<WatchResult> {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const intervalMs = options.intervalMs ?? 700;
  const deadline = deps.now() + timeoutMs;
  const rejected = new Set<string>();
  if (options.baseline) {
    rejected.add(options.baseline.trim());
  }

  for (;;) {
    if (deps.isCancelled()) {
      return { status: "cancelled" };
    }

    const candidate = (await deps.readClipboard()).trim();
    if (candidate && !rejected.has(candidate) && looksLikeKey(candidate)) {
      if (await deps.validate(candidate)) {
        return { status: "found", key: candidate };
      }
      rejected.add(candidate);
    }

    if (deps.now() >= deadline) {
      return { status: "timeout" };
    }
    await deps.sleep(intervalMs);
  }
}
