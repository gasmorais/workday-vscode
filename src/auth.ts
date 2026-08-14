import * as vscode from "vscode";
import { ProofHubClient, ProofHubError, looksLikeKey, normalizeAccount } from "./client.js";
import { personName, type Person } from "./types.js";
import { watchClipboardForKey } from "./key-watch.js";

const SECRET_PREFIX = "proofhub.apiKey";

export interface Session {
  account: string;
  apiKey: string;
  client: ProofHubClient;
}

function secretKey(account: string): string {
  return `${SECRET_PREFIX}:${account}`;
}

function settings() {
  return vscode.workspace.getConfiguration("proofhub");
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
      title: "ProofHub account",
      prompt: "The host of your ProofHub account",
      placeHolder: "acme.proofhub.com",
      value: configured,
      ignoreFocusOut: true,
      validateInput: (value) => {
        try {
          normalizeAccount(value);
          return undefined;
        } catch {
          return "Enter a host such as acme.proofhub.com";
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
    `Connect to ${account}`,
    {
      modal: true,
      detail:
        "ProofHub has no OAuth, so the key is copied once. The browser opens on the API access page: copy the key there and come back. VS Code watches the clipboard and connects on its own, with nothing to paste here.",
    },
    "Open ProofHub and wait for the key",
    "Paste the key myself",
    "Change account",
  );
  if (!proceed) {
    return undefined;
  }
  if (proceed === "Change account") {
    return connect(context, { askAccount: true });
  }

  let person: Person | undefined;
  let apiKey: string | undefined;

  if (proceed === "Open ProofHub and wait for the key") {
    const baseline = (await vscode.env.clipboard.readText()).trim();
    await vscode.env.openExternal(vscode.Uri.parse(apiPageUrl(account)));

    const captured = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Waiting for the ProofHub key",
        cancellable: true,
      },
      async (progress, token) => {
        progress.report({ message: "Copy the key in the browser" });
        return watchClipboardForKey({
          readClipboard: () => Promise.resolve(vscode.env.clipboard.readText()),
          validate: async (candidate) => {
            try {
              person = await buildClient(account, candidate).me();
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
        }, { baseline });
      },
    );

    if (captured.status === "cancelled") {
      return undefined;
    }
    if (captured.status === "found") {
      apiKey = captured.key;
    } else {
      const retry = await vscode.window.showWarningMessage(
        "No valid key showed up in the clipboard.",
        "Paste it myself",
      );
      if (!retry) {
        return undefined;
      }
    }
  }

  if (!apiKey) {
    const clipboard = (await vscode.env.clipboard.readText()).trim();
    const typed = await vscode.window.showInputBox({
      title: `Connect to ${account}`,
      prompt: "Paste the API key from the API access dialog",
      value: looksLikeKey(clipboard) ? clipboard : "",
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() ? undefined : "The key cannot be empty"),
    });
    if (!typed) {
      return undefined;
    }
    apiKey = typed.trim();
    try {
      person = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Checking the key for ${account}` },
        () => buildClient(account, apiKey!).me(),
      );
    } catch (error) {
      const retry = await vscode.window.showErrorMessage(describeFailure(error), "Try again");
      return retry ? connect(context, options) : undefined;
    }
  }

  await context.secrets.store(secretKey(account), apiKey);
  await settings().update("account", account, vscode.ConfigurationTarget.Global);
  if (!settings().get<string>("contactEmail")?.trim() && person?.email) {
    await settings().update("contactEmail", person.email, vscode.ConfigurationTarget.Global);
  }

  vscode.window.showInformationMessage(
    person ? `ProofHub connected as ${personName(person)}.` : "ProofHub connected.",
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
  vscode.window.showInformationMessage("ProofHub key removed from this machine.");
}

export function describeFailure(error: unknown): string {
  if (error instanceof ProofHubError) {
    return error.isAuthFailure
      ? "ProofHub rejected the key. Run ProofHub: Connect to paste a new one."
      : `ProofHub error ${error.status}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
