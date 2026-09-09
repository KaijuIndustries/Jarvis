import assert from "node:assert/strict";
import { test } from "node:test";
import { queryNeedsHomeAssistant } from "./needs-home.ts";

test("detects home control and device state questions", () => {
  assert.equal(queryNeedsHomeAssistant("turn the living room light off"), true);
  assert.equal(queryNeedsHomeAssistant("Set the bedroom light to 30 percent."), true);
  assert.equal(queryNeedsHomeAssistant("Is the kitchen light on?"), true);
  assert.equal(queryNeedsHomeAssistant("What lights do I have downstairs?"), true);
  assert.equal(queryNeedsHomeAssistant("turn on the hallway lamp"), true);
});

test("ignores unrelated conversation", () => {
  assert.equal(queryNeedsHomeAssistant("how do I write a function"), false);
  assert.equal(queryNeedsHomeAssistant("tell me a joke"), false);
});
