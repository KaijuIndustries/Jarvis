import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatLocalCivilTime,
  formatServerDateTime,
  queryNeedsServerTime,
} from "./server-time.ts";

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

test("uses local Date fields and does not present UTC/ISO as local", () => {
  const now = new Date("2026-08-30T21:26:00.000Z");
  const block = formatServerDateTime(now);
  const civil = formatLocalCivilTime(now);
  const localHour = String(now.getHours()).padStart(2, "0");
  const utcHour = String(now.getUTCHours()).padStart(2, "0");

  assert.match(block, /Trusted server clock/);
  assert.match(block, /Current server local date and time:/);
  assert.ok(block.includes(civil));
  assert.doesNotMatch(block, /2026-08-30T21:26:00\.000Z/);
  assert.doesNotMatch(block, /toISOString/);

  if (now.getHours() !== now.getUTCHours()) {
    assert.match(block, new RegExp(`${localHour}:26:00`));
    assert.doesNotMatch(block, new RegExp(`${utcHour}:26:00`));
  }
});
