import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ProofHubClient, ProofHubError, looksLikeKey, normalizeAccount } from "../out/client.js";
import { RateLimiter } from "../out/rate-limit.js";

function reply(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: init.headers ?? {},
  });
}

function recorder(responses) {
  const calls = [];
  const queue = [...responses];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return queue.length > 1 ? queue.shift() : queue[0];
  };
  return { calls, fetchImpl };
}

test("account accepts a bare name, a host and a full url", () => {
  assert.equal(normalizeAccount("acme"), "acme.proofhub.com");
  assert.equal(normalizeAccount("acme.proofhub.com"), "acme.proofhub.com");
  assert.equal(normalizeAccount("https://ACME.proofhub.com/projects"), "acme.proofhub.com");
  assert.throws(() => normalizeAccount(""));
  assert.throws(() => normalizeAccount("not a host"));
});

test("every request carries the key and the required user agent", async () => {
  const { calls, fetchImpl } = recorder([reply({ id: "1" })]);
  const client = new ProofHubClient({
    account: "acme",
    apiKey: "secret-key",
    contactEmail: "dev@acme.com",
    fetchImpl,
  });

  await client.me();

  assert.equal(calls[0].url, "https://acme.proofhub.com/api/v3/me");
  assert.equal(calls[0].options.headers["X-API-KEY"], "secret-key");
  assert.equal(calls[0].options.headers["User-Agent"], "VSCode-ProofHub (dev@acme.com)");
});

test("a task is created on the todolist endpoint with a json body", async () => {
  const { calls, fetchImpl } = recorder([reply({ id: "9", title: "Ship it" })]);
  const client = new ProofHubClient({ account: "acme", apiKey: "k", fetchImpl });

  const task = await client.createTask("p1", "t1", { title: "Ship it", assigned: ["u1"] });

  assert.equal(task.id, "9");
  assert.equal(calls[0].url, "https://acme.proofhub.com/api/v3/projects/p1/todolists/t1/tasks");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), { title: "Ship it", assigned: ["u1"] });
});

test("completing a task sends completed true", async () => {
  const { calls, fetchImpl } = recorder([reply({ id: "9", completed: true })]);
  const client = new ProofHubClient({ account: "acme", apiKey: "k", fetchImpl });

  await client.completeTask("p1", "t1", "9");

  assert.equal(calls[0].options.method, "PUT");
  assert.deepEqual(JSON.parse(calls[0].options.body), { completed: true });
});

test("a 429 is retried after the interval the server asks for", async () => {
  const waits = [];
  const responses = [
    new Response("", { status: 429, headers: { "Retry-After": "2" } }),
    reply({ id: "1" }),
  ];
  let index = 0;
  const client = new ProofHubClient({
    account: "acme",
    apiKey: "k",
    fetchImpl: async () => responses[Math.min(index++, responses.length - 1)],
    sleep: async (ms) => {
      waits.push(ms);
    },
  });

  const person = await client.me();

  assert.equal(person.id, "1");
  assert.equal(index, 2);
  assert.equal(waits[0], 2000);
});

test("a failing response becomes an error carrying the status and message", async () => {
  const { fetchImpl } = recorder([
    new Response(JSON.stringify({ message: "Invalid API key" }), { status: 401 }),
  ]);
  const client = new ProofHubClient({ account: "acme", apiKey: "bad", fetchImpl });

  await assert.rejects(
    () => client.me(),
    (error) => {
      assert.ok(error instanceof ProofHubError);
      assert.equal(error.status, 401);
      assert.equal(error.message, "Invalid API key");
      assert.equal(error.isAuthFailure, true);
      return true;
    },
  );
});

test("the limiter holds requests once the window is full", async () => {
  let clock = 0;
  const slept = [];
  const limiter = new RateLimiter({
    limit: 2,
    windowMs: 1000,
    now: () => clock,
    sleep: async (ms) => {
      slept.push(ms);
      clock += ms;
    },
  });

  await limiter.acquire();
  await limiter.acquire();
  assert.deepEqual(slept, []);

  await limiter.acquire();
  assert.deepEqual(slept, [1000]);
});

test("a key from the clipboard is only accepted when it looks like a key", () => {
  assert.equal(looksLikeKey("a1b2c3d4e5f6g7h8i9j0"), true);
  assert.equal(looksLikeKey("  a1b2c3d4e5f6g7h8i9j0  "), true);
  assert.equal(looksLikeKey("short"), false);
  assert.equal(looksLikeKey("has spaces in it and is long"), false);
  assert.equal(looksLikeKey("https://acme.proofhub.com/projects"), false);
});
