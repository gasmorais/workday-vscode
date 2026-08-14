import { strict as assert } from "node:assert";
import { test } from "node:test";
import { watchClipboardForKey } from "../out/key-watch.js";

function harness(clips, { validKey, cancelAfter } = {}) {
  let clock = 0;
  let reads = 0;
  const validated = [];
  return {
    validated,
    get reads() {
      return reads;
    },
    deps: {
      readClipboard: async () => clips[Math.min(reads++, clips.length - 1)],
      validate: async (key) => {
        validated.push(key);
        return key === validKey;
      },
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
      isCancelled: () => cancelAfter !== undefined && reads > cancelAfter,
    },
  };
}

test("a key copied in the browser connects without any pasting", async () => {
  const h = harness(["old note", "old note", "a1b2c3d4e5f6g7h8i9j0"], {
    validKey: "a1b2c3d4e5f6g7h8i9j0",
  });
  const result = await watchClipboardForKey(h.deps, { baseline: "old note" });
  assert.deepEqual(result, { status: "found", key: "a1b2c3d4e5f6g7h8i9j0" });
});

test("whatever was already on the clipboard is not mistaken for the key", async () => {
  const stale = "z9y8x7w6v5u4t3s2r1q0";
  const h = harness([stale], { validKey: stale });
  const result = await watchClipboardForKey(h.deps, { baseline: stale, timeoutMs: 0 });
  assert.equal(result.status, "timeout");
  assert.deepEqual(h.validated, []);
});

test("a rejected candidate is never validated twice", async () => {
  const h = harness(["wrongkeywrongkeywrong", "wrongkeywrongkeywrong", "wrongkeywrongkeywrong"], {
    validKey: "never",
  });
  const result = await watchClipboardForKey(h.deps, { timeoutMs: 2000, intervalMs: 1000 });
  assert.equal(result.status, "timeout");
  assert.deepEqual(h.validated, ["wrongkeywrongkeywrong"]);
});

test("text that cannot be a key is ignored without spending a request", async () => {
  const h = harness(["https://acme.proofhub.com/bapplite/", "short"], { validKey: "none" });
  const result = await watchClipboardForKey(h.deps, { timeoutMs: 1000, intervalMs: 1000 });
  assert.equal(result.status, "timeout");
  assert.deepEqual(h.validated, []);
});

test("cancelling stops the watch", async () => {
  const h = harness(["nothing here"], { validKey: "none", cancelAfter: 1 });
  const result = await watchClipboardForKey(h.deps, { timeoutMs: 60_000, intervalMs: 10 });
  assert.equal(result.status, "cancelled");
});
