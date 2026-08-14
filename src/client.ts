import { RateLimiter } from "./rate-limit.js";
import { appPath, type Location } from "./urls.js";
import type {
  Comment,
  Id,
  NewTimeEntry,
  Person,
  Project,
  Subtask,
  Task,
  TimeEntry,
  Timesheet,
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

  get accountHost(): string {
    return this.host;
  }

  appUrl(location: Location): string {
    return this.webUrl(appPath(location));
  }

  async list<T>(method: string, path: string, body?: unknown): Promise<T[]> {
    return asArray<T>(await this.request<unknown>(method, path, body));
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
    return this.list<Project>("GET", `projects${query}`);
  }

  people(): Promise<Person[]> {
    return this.list<Person>("GET", "people");
  }

  todolists(projectId: Id): Promise<Todolist[]> {
    return this.list<Todolist>("GET", `projects/${projectId}/todolists`);
  }

  tasks(projectId: Id, todolistId: Id): Promise<Task[]> {
    return this.list<Task>("GET", `projects/${projectId}/todolists/${todolistId}/tasks`);
  }

  createTask(projectId: Id, todolistId: Id, task: Partial<Task>): Promise<Task> {
    return this.request<Task>("POST", `projects/${projectId}/todolists/${todolistId}/tasks`, task);
  }

  updateTask(
    projectId: Id,
    todolistId: Id,
    taskId: Id,
    changes: Partial<Task>,
  ): Promise<Task> {
    return this.request<Task>(
      "PUT",
      `projects/${projectId}/todolists/${todolistId}/tasks/${taskId}`,
      changes,
    );
  }

  completeTask(projectId: Id, todolistId: Id, taskId: Id): Promise<Task> {
    return this.updateTask(projectId, todolistId, taskId, { completed: true });
  }

  comments(projectId: Id, todolistId: Id, taskId: Id): Promise<Comment[]> {
    return this.list<Comment>(
      "GET",
      `projects/${projectId}/todolists/${todolistId}/tasks/${taskId}/comments`,
    );
  }

  addComment(projectId: Id, todolistId: Id, taskId: Id, description: string): Promise<Comment> {
    return this.request<Comment>(
      "POST",
      `projects/${projectId}/todolists/${todolistId}/tasks/${taskId}/comments`,
      { description },
    );
  }

  task(projectId: Id, todolistId: Id, taskId: Id): Promise<Task> {
    return this.request<Task>(
      "GET",
      `projects/${projectId}/todolists/${todolistId}/tasks/${taskId}`,
    );
  }

  subtasks(projectId: Id, todolistId: Id, taskId: Id): Promise<Subtask[]> {
    return this.list<Subtask>(
      "GET",
      `projects/${projectId}/todolists/${todolistId}/tasks/${taskId}/subtasks`,
    );
  }

  subtask(projectId: Id, todolistId: Id, taskId: Id, subtaskId: Id): Promise<Subtask> {
    return this.request<Subtask>(
      "GET",
      `projects/${projectId}/todolists/${todolistId}/tasks/${taskId}/subtasks/${subtaskId}`,
    );
  }

  async subtaskComments(
    projectId: Id,
    todolistId: Id,
    taskId: Id,
    subtaskId: Id,
  ): Promise<Comment[]> {
    try {
      return await this.list<Comment>(
        "GET",
        `projects/${projectId}/todolists/${todolistId}/tasks/${taskId}/subtasks/${subtaskId}/comments`,
      );
    } catch (error) {
      if (error instanceof ProofHubError && error.status === 404) {
        return this.comments(projectId, todolistId, subtaskId);
      }
      throw error;
    }
  }

  async addSubtaskComment(
    projectId: Id,
    todolistId: Id,
    taskId: Id,
    subtaskId: Id,
    description: string,
  ): Promise<Comment> {
    try {
      return await this.request<Comment>(
        "POST",
        `projects/${projectId}/todolists/${todolistId}/tasks/${taskId}/subtasks/${subtaskId}/comments`,
        { description },
      );
    } catch (error) {
      if (error instanceof ProofHubError && error.status === 404) {
        return this.addComment(projectId, todolistId, subtaskId, description);
      }
      throw error;
    }
  }

  createSubtask(
    projectId: Id,
    todolistId: Id,
    taskId: Id,
    subtask: Partial<Subtask>,
  ): Promise<Subtask> {
    return this.request<Subtask>(
      "POST",
      `projects/${projectId}/todolists/${todolistId}/tasks/${taskId}/subtasks`,
      subtask,
    );
  }

  updateSubtask(
    projectId: Id,
    todolistId: Id,
    taskId: Id,
    subtaskId: Id,
    changes: Partial<Subtask>,
  ): Promise<Subtask> {
    return this.request<Subtask>(
      "PUT",
      `projects/${projectId}/todolists/${todolistId}/tasks/${taskId}/subtasks/${subtaskId}`,
      changes,
    );
  }

  timeEntries(projectId: Id, timesheetId: Id): Promise<TimeEntry[]> {
    return this.list<TimeEntry>("GET", `projects/${projectId}/timesheets/${timesheetId}/time`);
  }

  timesheets(projectId: Id): Promise<Timesheet[]> {
    return this.list<Timesheet>("GET", `projects/${projectId}/timesheets`);
  }

  logTime(entry: NewTimeEntry): Promise<TimeEntry> {
    return this.request<TimeEntry>(
      "POST",
      `projects/${entry.project}/timesheets/${entry.timesheet_id}/time`,
      entry,
    );
  }
}

export function asArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (payload && typeof payload === "object") {
    const values = Object.values(payload as Record<string, unknown>);
    const nested = values.find((value) => Array.isArray(value));
    if (nested) {
      return nested as T[];
    }
  }
  return [];
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
