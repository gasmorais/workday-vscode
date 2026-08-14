import { strict as assert } from "node:assert";
import { test } from "node:test";
import { appPath, bareId, parseAppUrl } from "../out/urls.js";
import { ProofHubClient } from "../out/client.js";

const REAL =
  "https://acme.proofhub.com/bapplite/#app/todos/project-8557549576/list-271272987407";

test("a list url is rebuilt exactly as the ProofHub app writes it", () => {
  const client = new ProofHubClient({ account: "acme.proofhub.com", apiKey: "k" });
  const url = client.appUrl({ projectId: "8557549576", todolistId: "271272987407" });
  assert.equal(url, REAL);
});

test("a project url stops before the list segment", () => {
  assert.equal(appPath({ projectId: "8557549576" }), "bapplite/#app/todos/project-8557549576");
});

test("ids that already carry their prefix are not doubled", () => {
  assert.equal(bareId("project-123", "project"), "123");
  assert.equal(bareId("123", "project"), "123");
  assert.equal(
    appPath({ projectId: "project-8557549576", todolistId: "list-271272987407" }),
    "bapplite/#app/todos/project-8557549576/list-271272987407",
  );
});

test("a pasted url is parsed back into host, project and list", () => {
  const parsed = parseAppUrl(REAL);
  assert.deepEqual(parsed, {
    host: "acme.proofhub.com",
    projectId: "8557549576",
    todolistId: "271272987407",
  });
});

test("a url without a list still yields the project", () => {
  const parsed = parseAppUrl("https://acme.proofhub.com/bapplite/#app/todos/project-99");
  assert.equal(parsed.projectId, "99");
  assert.equal(parsed.todolistId, undefined);
});

test("anything that is not a task link is rejected", () => {
  assert.equal(parseAppUrl("https://acme.proofhub.com/"), undefined);
  assert.equal(parseAppUrl("https://acme.proofhub.com/bapplite/#app/calendar"), undefined);
  assert.equal(parseAppUrl("just some text"), undefined);
});

test("the host travels with the parse so a foreign link can be caught", () => {
  const parsed = parseAppUrl("https://outracorp.proofhub.com/bapplite/#app/todos/project-1");
  assert.equal(parsed.host, "outracorp.proofhub.com");
  assert.notEqual(parsed.host, "acme.proofhub.com");
});
