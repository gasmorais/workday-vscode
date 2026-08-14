import * as vscode from "vscode";
import { CONFIG_SECTION, GRAPH_SCOPES, SECRET_TEAMS_REFRESH } from "../constants.js";
import { t } from "../locales/index.js";

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface DeviceCodeResponse {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  expires_in?: number;
  interval?: number;
  message?: string;
  error?: string;
  error_description?: string;
}

function settings() {
  return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

function tenant(): string {
  return settings().get<string>("teams.tenantId")?.trim() || "organizations";
}

function clientId(): string {
  return settings().get<string>("teams.clientId")?.trim() ?? "";
}

function authority(path: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant())}/oauth2/v2.0/${path}`;
}

export class TeamsAuth {
  private cached: { token: string; until: number } | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async token(options: { interactive?: boolean } = {}): Promise<string | undefined> {
    if (this.cached && this.cached.until > Date.now() + 60_000) {
      return this.cached.token;
    }
    const fromRefresh = await this.fromRefreshToken();
    if (fromRefresh) {
      return fromRefresh;
    }
    if (clientId()) {
      return options.interactive ? this.fromDeviceCode() : undefined;
    }
    return this.fromVsCode(options.interactive ?? false);
  }

  async signOut(): Promise<void> {
    this.cached = undefined;
    await this.context.secrets.delete(SECRET_TEAMS_REFRESH);
  }

  private remember(payload: TokenResponse): string | undefined {
    if (!payload.access_token) {
      return undefined;
    }
    this.cached = {
      token: payload.access_token,
      until: Date.now() + (payload.expires_in ?? 3600) * 1000,
    };
    if (payload.refresh_token) {
      void this.context.secrets.store(SECRET_TEAMS_REFRESH, payload.refresh_token);
    }
    return payload.access_token;
  }

  private async fromVsCode(interactive: boolean): Promise<string | undefined> {
    const scopes = GRAPH_SCOPES.filter((scope) => scope !== "offline_access");
    try {
      const session = await vscode.authentication.getSession("microsoft", scopes, {
        createIfNone: interactive,
        silent: interactive ? undefined : true,
      });
      if (!session) {
        return undefined;
      }
      this.cached = { token: session.accessToken, until: Date.now() + 45 * 60_000 };
      return session.accessToken;
    } catch (error) {
      if (interactive) {
        throw error;
      }
      return undefined;
    }
  }

  private async fromRefreshToken(): Promise<string | undefined> {
    const refresh = await this.context.secrets.get(SECRET_TEAMS_REFRESH);
    const id = clientId();
    if (!refresh || !id) {
      return undefined;
    }
    const response = await fetch(authority("token"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: id,
        grant_type: "refresh_token",
        refresh_token: refresh,
        scope: GRAPH_SCOPES.join(" "),
      }),
    });
    const payload = (await response.json()) as TokenResponse;
    if (!response.ok) {
      await this.context.secrets.delete(SECRET_TEAMS_REFRESH);
      return undefined;
    }
    return this.remember(payload);
  }

  private async fromDeviceCode(): Promise<string | undefined> {
    const id = clientId();
    const started = await fetch(authority("devicecode"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: id, scope: GRAPH_SCOPES.join(" ") }),
    });
    const device = (await started.json()) as DeviceCodeResponse;
    if (!started.ok || !device.device_code || !device.user_code) {
      vscode.window.showErrorMessage(
        t.teams.deviceFailed(device.error_description ?? device.error ?? ""),
      );
      return undefined;
    }

    await vscode.env.clipboard.writeText(device.user_code);
    const go = await vscode.window.showInformationMessage(
      t.teams.deviceTitle(device.user_code),
      { modal: true, detail: t.teams.deviceDetail },
      t.teams.deviceOpen,
    );
    if (!go) {
      return undefined;
    }
    await vscode.env.openExternal(
      vscode.Uri.parse(device.verification_uri ?? "https://microsoft.com/devicelogin"),
    );

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t.teams.deviceWaiting,
        cancellable: true,
      },
      async (_progress, cancel) => {
        const interval = Math.max(device.interval ?? 5, 1) * 1000;
        const deadline = Date.now() + (device.expires_in ?? 900) * 1000;
        while (Date.now() < deadline && !cancel.isCancellationRequested) {
          await new Promise((resolve) => setTimeout(resolve, interval));
          const response = await fetch(authority("token"), {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: id,
              grant_type: "urn:ietf:params:oauth:grant-type:device_code",
              device_code: device.device_code ?? "",
            }),
          });
          const payload = (await response.json()) as TokenResponse;
          if (response.ok) {
            return this.remember(payload);
          }
          if (payload.error && payload.error !== "authorization_pending") {
            vscode.window.showErrorMessage(
              t.teams.deviceFailed(payload.error_description ?? payload.error),
            );
            return undefined;
          }
        }
        return undefined;
      },
    );
  }
}
