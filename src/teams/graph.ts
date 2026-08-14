import { RateLimiter } from "../rate-limit.js";
import { t } from "../locales/index.js";
import {
  GRAPH_BASE,
  REQUEST_TIMEOUT_SECONDS,
  RETRY_ATTEMPTS,
  RETRY_BACKOFF_MS,
} from "../constants.js";

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = "GraphError";
  }

  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export interface GraphOptions {
  token: () => Promise<string | undefined>;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  timeoutMs?: number;
  limiter?: RateLimiter;
}

export interface Identity {
  id?: string;
  displayName?: string;
  userIdentityType?: string;
}

export interface ChatMember {
  id?: string;
  displayName?: string;
  userId?: string;
  email?: string;
}

export interface Chat {
  id: string;
  topic?: string | null;
  chatType?: string;
  webUrl?: string;
  lastUpdatedDateTime?: string;
  members?: ChatMember[];
  lastMessagePreview?: { createdDateTime?: string; body?: { content?: string } };
}

export interface ChatMessage {
  id: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  messageType?: string;
  from?: { user?: Identity | null; application?: Identity | null };
  body?: { contentType?: string; content?: string };
  deletedDateTime?: string | null;
}

export interface Presence {
  availability?: string;
  activity?: string;
  statusMessage?: { message?: { content?: string } };
}

export interface CalendarEvent {
  id: string;
  subject?: string;
  isOnlineMeeting?: boolean;
  onlineMeeting?: { joinUrl?: string } | null;
  webLink?: string;
  isCancelled?: boolean;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  organizer?: { emailAddress?: { name?: string } };
}

export class GraphClient {
  private readonly limiter: RateLimiter;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: GraphOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.limiter = options.limiter ?? new RateLimiter({ limit: 20, sleep: options.sleep });
    this.maxRetries = options.maxRetries ?? RETRY_ATTEMPTS;
    this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_SECONDS * 1000;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.options.token();
    if (!token) {
      throw new GraphError(t.teams.notConnected, 401, path);
    }
    const url = path.startsWith("http") ? path : `${GRAPH_BASE}/${path.replace(/^\//, "")}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    for (let attempt = 0; ; attempt++) {
      await this.limiter.acquire();
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal:
            this.timeoutMs > 0 && typeof AbortSignal?.timeout === "function"
              ? AbortSignal.timeout(this.timeoutMs)
              : undefined,
        });
      } catch (error) {
        if (attempt < this.maxRetries && !(error instanceof Error && error.name === "AbortError")) {
          await this.sleep(RETRY_BACKOFF_MS * 2 ** attempt);
          continue;
        }
        throw new GraphError(
          t.connect.unreachable(error instanceof Error ? error.message : String(error)),
          0,
          path,
        );
      }

      if (response.status === 429 && attempt < this.maxRetries) {
        const wait = Math.max(Number(response.headers.get("Retry-After") ?? "1"), 1) * 1000;
        this.limiter.pauseFor(wait);
        await this.sleep(wait);
        continue;
      }
      if (response.status >= 500 && attempt < this.maxRetries) {
        await this.sleep(RETRY_BACKOFF_MS * 2 ** attempt);
        continue;
      }
      if (!response.ok) {
        throw new GraphError(await describe(response), response.status, path);
      }
      if (response.status === 204) {
        return undefined as T;
      }
      return (await response.json()) as T;
    }
  }

  private async collect<T>(path: string, pages = 1): Promise<T[]> {
    const items: T[] = [];
    let next: string | undefined = path;
    for (let page = 0; page < pages && next; page++) {
      const payload: { value?: T[]; "@odata.nextLink"?: string } = await this.request("GET", next);
      items.push(...(payload.value ?? []));
      next = payload["@odata.nextLink"];
    }
    return items;
  }

  me(): Promise<Identity & { mail?: string; userPrincipalName?: string }> {
    return this.request("GET", "me?$select=id,displayName,mail,userPrincipalName");
  }

  chats(top = 50): Promise<Chat[]> {
    return this.collect<Chat>(
      `me/chats?$top=${top}&$expand=members&$orderby=lastMessagePreview/createdDateTime desc`,
    );
  }

  chat(chatId: string): Promise<Chat> {
    return this.request("GET", `me/chats/${encodeURIComponent(chatId)}?$expand=members`);
  }

  messages(chatId: string, top = 30): Promise<ChatMessage[]> {
    return this.collect<ChatMessage>(`me/chats/${encodeURIComponent(chatId)}/messages?$top=${top}`);
  }

  async sendMessage(chatId: string, html: string): Promise<ChatMessage> {
    return this.request("POST", `me/chats/${encodeURIComponent(chatId)}/messages`, {
      body: { contentType: "html", content: html },
    });
  }

  presence(): Promise<Presence> {
    return this.request("GET", "me/presence");
  }

  events(fromIso: string, toIso: string): Promise<CalendarEvent[]> {
    const query = new URLSearchParams({
      startDateTime: fromIso,
      endDateTime: toIso,
      $orderby: "start/dateTime",
      $top: "50",
      $select: "id,subject,start,end,isOnlineMeeting,onlineMeeting,webLink,isCancelled,organizer",
    });
    return this.collect<CalendarEvent>(`me/calendarView?${query.toString()}`);
  }
}

async function describe(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string; code?: string } };
    const message = payload.error?.message ?? payload.error?.code;
    if (message) {
      return t.teams.failure(response.status, message);
    }
  } catch {
    return t.teams.failure(response.status, response.statusText || "");
  }
  return t.teams.failure(response.status, response.statusText || "");
}
