import { strict as assert } from "node:assert";
import { test } from "node:test";
import { formatDuration, today } from "../out/time.js";

test("duration is reported as hours and minutes for the timesheet", () => {
  assert.equal(formatDuration(90 * 60 * 1000), "1:30");
  assert.equal(formatDuration(60 * 60 * 1000), "1:00");
  assert.equal(formatDuration(5 * 60 * 1000), "0:05");
  assert.equal(formatDuration(9 * 60 * 60 * 1000 + 5 * 60 * 1000), "9:05");
});

test("a session shorter than a minute still logs one minute", () => {
  assert.equal(formatDuration(0), "0:01");
  assert.equal(formatDuration(2_000), "0:01");
});

test("the logged date is the plain calendar day", () => {
  assert.equal(today(new Date("2026-08-14T18:30:00Z")), "2026-08-14");
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
});
