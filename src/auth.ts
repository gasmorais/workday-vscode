import * as vscode from "vscode";
import { ProofHubClient, ProofHubError, looksLikeKey, normalizeAccount } from "./client.js";
import { personName } from "./types.js";

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
        "ProofHub has no OAuth, so the key is copied by hand once. The browser opens on the account: click the profile icon at the bottom left, choose API access, and copy the key. Back in VS Code it is picked up from the clipboard automatically.",
    },
    "Open ProofHub",
    "I already have the key",
    "Change account",
  );
  if (!proceed) {
    return undefined;
  }
  if (proceed === "Change account") {
    return connect(context, { askAccount: true });
  }
  if (proceed === "Open ProofHub") {
    await vscode.env.openExternal(vscode.Uri.parse(`https://${account}/bapplite/`));
  }

  const clipboard = (await vscode.env.clipboard.readText()).trim();
  const suggestion = looksLikeKey(clipboard) ? clipboard : "";
  const apiKey = await vscode.window.showInputBox({
    title: `Connect to ${account}`,
    prompt: suggestion
      ? "Key found in the clipboard, press Enter to use it"
      : "Paste the API key from the API access dialog",
    value: suggestion,
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() ? undefined : "The key cannot be empty"),
  });
  if (!apiKey) {
    return undefined;
  }

  const client = new ProofHubClient({
    account,
    apiKey: apiKey.trim(),
    contactEmail: settings().get<string>("contactEmail") ?? "",
  });

  let person;
  try {
    person = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Checking the key for ${account}` },
      () => client.me(),
    );
  } catch (error) {
    const retry = await vscode.window.showErrorMessage(describeFailure(error), "Try again");
    return retry ? connect(context, options) : undefined;
  }

  await context.secrets.store(secretKey(account), apiKey.trim());
  await settings().update("account", account, vscode.ConfigurationTarget.Global);
  if (!settings().get<string>("contactEmail")?.trim() && person.email) {
    await settings().update("contactEmail", person.email, vscode.ConfigurationTarget.Global);
  }

  vscode.window.showInformationMessage(`ProofHub connected as ${personName(person)}.`);
  return { account, apiKey: apiKey.trim(), client: buildClient(account, apiKey.trim()) };
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
