import * as vscode from "vscode";
import { ProofHubError, type ProofHubClient } from "./client.js";
import { t } from "./locales/index.js";
import { personName, sameId, type Id, type Person } from "./types.js";
import { CONFIG_SECTION, STATE_MY_PERSON } from "./constants.js";

export async function verifyKey(client: ProofHubClient): Promise<Person | undefined> {
  try {
    return await client.me();
  } catch (error) {
    if (error instanceof ProofHubError && !error.isAuthFailure) {
      await client.projects(false);
      return undefined;
    }
    throw error;
  }
}

export async function resolveMe(
  context: vscode.ExtensionContext,
  client: ProofHubClient,
  options: { ask?: boolean } = {},
): Promise<Person | undefined> {
  const people = await client.people().catch<Person[]>(() => []);
  const stored = context.globalState.get<Id>(STATE_MY_PERSON);
  const known = people.find((person) => sameId(person.id, stored));
  if (known) {
    return known;
  }

  const direct = await client.me().catch(() => undefined);
  if (direct?.id !== undefined) {
    await context.globalState.update(STATE_MY_PERSON, direct.id);
    return people.find((person) => sameId(person.id, direct.id)) ?? direct;
  }

  const email = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<string>("contactEmail")
    ?.trim();
  const byEmail = email
    ? people.find((person) => person.email?.toLowerCase() === email.toLowerCase())
    : undefined;
  if (byEmail) {
    await context.globalState.update(STATE_MY_PERSON, byEmail.id);
    return byEmail;
  }

  if (!options.ask || people.length === 0) {
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    people
      .filter((person) => !person.suspended)
      .map((person) => ({ label: personName(person), description: person.email, person })),
    { title: t.me.whoAreYou, placeHolder: t.me.whoAreYouHint, matchOnDescription: true },
  );
  if (!picked) {
    return undefined;
  }
  await context.globalState.update(STATE_MY_PERSON, picked.person.id);
  if (picked.person.email && !email) {
    await vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .update("contactEmail", picked.person.email, vscode.ConfigurationTarget.Global);
  }
  return picked.person;
}

export async function forgetMe(context: vscode.ExtensionContext): Promise<void> {
  await context.globalState.update(STATE_MY_PERSON, undefined);
}
