import assert from "node:assert/strict";
import { test } from "node:test";
import { formatServerDateTime, queryNeedsServerTime } from "./server-time.ts";

test("detects common date and time questions", () => {
  assert.equal(queryNeedsServerTime("what time is it"), true);
  assert.equal(queryNeedsServerTime("What's the date?"), true);
  assert.equal(queryNeedsServerTime("what day is it today"), true);
  assert.equal(queryNeedsServerTime("current time please"), true);
  assert.equal(queryNeedsServerTime("tell me the time"), true);
  assert.equal(queryNeedsServerTime("do you know what time it is"), true);
});

test("ignores unrelated questions", () => {
  assert.equal(queryNeedsServerTime("how do I write a function"), false);
  assert.equal(queryNeedsServerTime("tell me about Friday"), false);
});

test("formats a fixed instant without leaking guessed dates", () => {
  const now = new Date("2026-08-30T21:26:00.000Z");
  const block = formatServerDateTime(now, "UTC");
  assert.match(block, /Trusted server clock/);
  assert.match(block, /Current server date and time:/);
  assert.match(block, /Sunday/);
  assert.match(block, /30 August 2026/);
  assert.match(block, /21:26:00/);
  assert.match(block, /\(UTC\)/);
});
