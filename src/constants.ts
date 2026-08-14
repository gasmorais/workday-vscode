export const CONFIG_SECTION = "proofhub";
export const VIEW_ID = "proofhub.projects";
export const ACCOUNT_PLACEHOLDER = "yourcompany.proofhub.com";

export const SECRET_PREFIX = "proofhub.apiKey";
export const STATE_LAST_ACCOUNT = "proofhub.lastAccount";
export const STATE_MY_PERSON = "proofhub.myPersonId";
export const STATE_RUNNING_TIMERS = "proofhub.runningTimers";

export const API_PATH = "api/v3";
export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
export const GRAPH_SCOPES = [
  "offline_access",
  "User.Read",
  "Chat.Read",
  "ChatMessage.Send",
  "Presence.Read",
  "Calendars.Read",
] as const;

export const SECRET_TEAMS_REFRESH = "proofhub.teams.refreshToken";
export const SECRET_TEAMS_LOCAL = "proofhub.teams.localToken";
export const STATE_CALL_LOG = "proofhub.teams.callLog";
export const STATE_TEAMS_WATCH = "proofhub.teams.watchCalls";
export const STATE_TEAMS_FAVORITES = "proofhub.teams.favorites";

export const TEAMS_LOCAL_PORT = 8124;
export const TEAMS_LOCAL_PROTOCOL = "2.0.0";
export const MAC_POLL_SECONDS = 10;
export const TEAMS_RECONNECT_MS = 15_000;
export const MIN_CALL_MINUTES = 2;
export const CHAT_PAGE_SIZE = 30;
export const APP_PREFIX = "bapplite/#app";

export const RATE_LIMIT = 25;
export const RATE_WINDOW_MS = 10_000;

export const TREE_CACHE_SECONDS = 60;
export const REQUEST_TIMEOUT_SECONDS = 20;
export const RETRY_ATTEMPTS = 3;
export const RETRY_BACKOFF_MS = 500;
export const FOCUS_SYNC_DEBOUNCE_MS = 5_000;
export const LONG_TIMER_MS = 8 * 60 * 60 * 1000;
export const NEAR_ESTIMATE_RATIO = 0.8;

export const HOURS_PATTERN = /^\d{1,3}:[0-5]\d$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
