import { RateLimiter } from "./rate-limit.js";
import type {
  Comment,
  Person,
  Project,
  Task,
  TimeEntry,
  Todolist,
} from "./types.js";

export class ProofHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = "ProofHubError";
  }

  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export interface ClientOptions {
  account: string;
  apiKey: string;
  contactEmail?: string;
  fetchImpl?: typeof fetch;
  limiter?: RateLimiter;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

export function normalizeAccount(input: string): string {
  const trimmed = input.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!trimmed) {
    throw new Error("account is required");
  }
  const host = trimmed.includes(".") ? trimmed : `${trimmed}.proofhub.com`;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host)) {
    throw new Error(`invalid account host: ${input}`);
  }
  return host.toLowerCase();
}

export function looksLikeKey(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(value.trim());
}

export class ProofHubClient {
  private readonly host: string;
  private readonly fetchImpl: typeof fetch;
  private readonly limiter: RateLimiter;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly userAgent: string;

  constructor(private readonly options: ClientOptions) {
    this.host = normalizeAccount(options.account);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.limiter = options.limiter ?? new RateLimiter({ sleep: options.sleep });
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.maxRetries = options.maxRetries ?? 3;
    const contact = options.contactEmail?.trim();
    this.userAgent = contact ? `VSCode-ProofHub (${contact})` : "VSCode-ProofHub";
  }

  get baseUrl(): string {
    return `https://${this.host}/api/v3`;
  }

  webUrl(path: string): string {
    return `https://${this.host}/${path.replace(/^\//, "")}`;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/${path.replace(/^\//, "")}`;
    const headers: Record<string, string> = {
      "X-API-KEY": this.options.apiKey,
      "User-Agent": this.userAgent,
      Accept: "application/json",
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    for (let attempt = 0; ; attempt++) {
      await this.limiter.acquire();
      const response = await this.fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (response.status === 429 && attempt < this.maxRetries) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
        const waitMs = Number.isFinite(retryAfter) ? Math.max(retryAfter, 1) * 1000 : 1000;
        this.limiter.pauseFor(waitMs);
        await this.sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        throw new ProofHubError(await describe(response), response.status, path);
      }

      if (response.status === 204) {
        return undefined as T;
      }
      return (await response.json()) as T;
    }
  }

  me(): Promise<Person> {
    return this.request<Person>("GET", "me");
  }

  projects(includeArchived = false): Promise<Project[]> {
    const query = includeArchived ? "?archived=1" : "";
    return this.request<Project[]>("GET", `projects${query}`);
  }

  people(): Promise<Person[]> {
    return this.request<Person[]>("GET", "people");
  }

  todolists(projectId: string): Promise<Todolist[]> {
    return this.request<Todolist[]>("GET", `projects/${projectId}/todolists`);
  }

  tasks(projectId: string, todolistId: string): Promise<Task[]> {
    return this.request<Task[]>("GET", `projects/${projectId}/todolists/${todolistId}/tasks`);
  }

  createTask(projectId: string, todolistId: string, task: Partial<Task>): Promise<Task> {
    return this.request<Task>("POST", `projects/${projectId}/todolists/${todolistId}/tasks`, task);
  }

  updateTask(
    projectId: string,
    todolistId: string,
    taskId: string,
    changes: Partial<Task>,
  ): Promise<Task> {
    return this.request<Task>(
      "PUT",
      `projects/${projectId}/todolists/${todolistId}/tasks/${taskId}`,
      changes,
    );
  }

  completeTask(projectId: string, todolistId: string, taskId: string): Promise<Task> {
    return this.updateTask(projectId, todolistId, taskId, { completed: true });
  }

  comments(projectId: string, todolistId: string, taskId: string): Promise<Comment[]> {
    return this.request<Comment[]>(
      "GET",
      `projects/${projectId}/todolists/${todolistId}/tasks/${taskId}/comments`,
    );
  }

  addComment(
    projectId: string,
    todolistId: string,
    taskId: string,
    content: string,
  ): Promise<Comment> {
    return this.request<Comment>(
      "POST",
      `projects/${projectId}/todolists/${todolistId}/tasks/${taskId}/comments`,
      { content },
    );
  }

  timesheets(projectId: string): Promise<{ id: string; title: string }[]> {
    return this.request<{ id: string; title: string }[]>("GET", `projects/${projectId}/timesheets`);
  }

  logTime(projectId: string, timesheetId: string, entry: Partial<TimeEntry>): Promise<TimeEntry> {
    return this.request<TimeEntry>(
      "POST",
      `projects/${projectId}/timesheets/${timesheetId}/time`,
      entry,
    );
  }
}

async function describe(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`;
  try {
    const text = await response.text();
    if (!text) {
      return fallback;
    }
    const parsed = JSON.parse(text) as { message?: string; error?: string };
    return parsed.message ?? parsed.error ?? text.slice(0, 200);
  } catch {
    return fallback;
  }
}
