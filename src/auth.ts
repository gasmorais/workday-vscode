import * as vscode from "vscode";
import { ProofHubClient, ProofHubError, looksLikeKey, normalizeAccount } from "./client.js";
import { personName, type Person } from "./types.js";
import { watchClipboardForKey } from "./key-watch.js";
import { verifyKey } from "./me.js";
import { t } from "./locales/index.js";
import { ACCOUNT_PLACEHOLDER, CONFIG_SECTION, SECRET_PREFIX } from "./constants.js";

export interface Session {
  account: string;
  apiKey: string;
  client: ProofHubClient;
}

function secretKey(account: string): string {
  return `${SECRET_PREFIX}:${account}`;
}

function settings() {
  return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

function buildClient(account: string, apiKey: string): ProofHubClient {
  return new ProofHubClient({
    account,
    apiKey,
    contactEmail: settings().get<string>("contactEmail") ?? "",
  });
}

export async function restoreSession(
  context: vscode.ExtensionContext,
): Promise<Session | undefined> {
  const configured = settings().get<string>("account")?.trim();
  if (!configured) {
    return undefined;
  }
  let account: string;
  try {
    account = normalizeAccount(configured);
  } catch {
    return undefined;
  }
  const apiKey = await context.secrets.get(secretKey(account));
  if (!apiKey) {
    return undefined;
  }
  return { account, apiKey, client: buildClient(account, apiKey) };
}

export async function connect(
  context: vscode.ExtensionContext,
  options: { askAccount?: boolean } = {},
): Promise<Session | undefined> {
  const configured = settings().get<string>("account")?.trim() ?? "";
  let account: string;

  if (options.askAccount || !configured) {
    const answer = await vscode.window.showInputBox({
      title: t.connect.accountTitle,
      prompt: t.connect.accountPrompt,
      placeHolder: ACCOUNT_PLACEHOLDER,
      value: configured,
      ignoreFocusOut: true,
      validateInput: (value) => {
        try {
          normalizeAccount(value);
          return undefined;
        } catch {
          return t.connect.accountInvalid;
        }
      },
    });
    if (!answer) {
      return undefined;
    }
    account = normalizeAccount(answer);
  } else {
    account = normalizeAccount(configured);
  }

  const proceed = await vscode.window.showInformationMessage(
    t.connect.title(account),
    {
      modal: true,
      detail: t.connect.detail,
    },
    t.connect.openBrowser,
    t.connect.pasteMyself,
    t.connect.changeAccount,
  );
  if (!proceed) {
    return undefined;
  }
  if (proceed === t.connect.changeAccount) {
    return connect(context, { askAccount: true });
  }

  let person: Person | undefined;
  let apiKey: string | undefined;

  if (proceed === t.connect.openBrowser) {
    const baseline = (await vscode.env.clipboard.readText()).trim();
    await vscode.env.openExternal(vscode.Uri.parse(apiPageUrl(account)));

    const captured = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t.connect.waiting,
        cancellable: true,
      },
      async (progress, token) => {
        progress.report({ message: t.connect.waitingHint });
        return watchClipboardForKey(
          {
            readClipboard: () => Promise.resolve(vscode.env.clipboard.readText()),
            validate: async (candidate) => {
              try {
                person = await verifyKey(buildClient(account, candidate));
                return true;
              } catch (error) {
                if (error instanceof ProofHubError && !error.isAuthFailure) {
                  throw error;
                }
                return false;
              }
            },
            sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
            now: () => Date.now(),
            isCancelled: () => token.isCancellationRequested,
          },
          { baseline },
        );
      },
    );

    if (captured.status === "cancelled") {
      return undefined;
    }
    if (captured.status === "found") {
      apiKey = captured.key;
    } else {
      const retry = await vscode.window.showWarningMessage(t.connect.notFound, t.connect.tryPaste);
      if (!retry) {
        return undefined;
      }
    }
  }

  if (!apiKey) {
    const clipboard = (await vscode.env.clipboard.readText()).trim();
    const typed = await vscode.window.showInputBox({
      title: t.connect.title(account),
      prompt: t.connect.keyPrompt,
      value: looksLikeKey(clipboard) ? clipboard : "",
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() ? undefined : t.connect.keyEmpty),
    });
    if (!typed) {
      return undefined;
    }
    apiKey = typed.trim();
    try {
      person = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: t.connect.checking(account) },
        () => verifyKey(buildClient(account, apiKey!)),
      );
    } catch (error) {
      const retry = await vscode.window.showErrorMessage(describeFailure(error), t.connect.retry);
      return retry ? connect(context, options) : undefined;
    }
  }

  await context.secrets.store(secretKey(account), apiKey);
  await settings().update("account", account, vscode.ConfigurationTarget.Global);
  if (!settings().get<string>("contactEmail")?.trim() && person?.email) {
    await settings().update("contactEmail", person.email, vscode.ConfigurationTarget.Global);
  }

  vscode.window.showInformationMessage(
    person ? t.connect.connectedAs(personName(person)) : t.connect.connected,
  );
  return { account, apiKey, client: buildClient(account, apiKey) };
}

export function apiPageUrl(account: string): string {
  const configured = settings().get<string>("apiPagePath")?.trim() || "bapplite/#app/me/api";
  return `https://${account}/${configured.replace(/^\//, "")}`;
}

export async function disconnect(context: vscode.ExtensionContext): Promise<void> {
  const configured = settings().get<string>("account")?.trim();
  if (configured) {
    await context.secrets.delete(secretKey(normalizeAccount(configured)));
  }
  vscode.window.showInformationMessage(t.connect.removed);
}

export function describeFailure(error: unknown): string {
  if (error instanceof ProofHubError) {
    return error.isAuthFailure
      ? t.connect.rejected
      : t.connect.failure(error.status, error.message);
  }
  return error instanceof Error ? error.message : String(error);
}
