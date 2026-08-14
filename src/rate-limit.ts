import { RATE_LIMIT, RATE_WINDOW_MS } from "./constants.js";

export interface RateLimitOptions {
  limit?: number;
  windowMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly hits: number[] = [];
  private chain: Promise<void> = Promise.resolve();
  private pausedUntil = 0;

  constructor(options: RateLimitOptions = {}) {
    this.limit = options.limit ?? RATE_LIMIT;
    this.windowMs = options.windowMs ?? RATE_WINDOW_MS;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  pauseFor(ms: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, this.now() + ms);
  }

  async acquire(): Promise<void> {
    const next = this.chain.then(() => this.reserve());
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async reserve(): Promise<void> {
    for (;;) {
      const now = this.now();
      const paused = this.pausedUntil - now;
      if (paused > 0) {
        await this.sleep(paused);
        continue;
      }

      while (this.hits.length > 0 && now - this.hits[0] >= this.windowMs) {
        this.hits.shift();
      }
      if (this.hits.length < this.limit) {
        this.hits.push(now);
        return;
      }
      await this.sleep(this.windowMs - (now - this.hits[0]));
    }
  }
}
