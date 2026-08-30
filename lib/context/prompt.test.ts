import assert from "node:assert/strict";
import { test } from "node:test";
import { formatContextForPrompt } from "./prompt.ts";
import type { ContextItem } from "./types.ts";

function item(partial: Partial<ContextItem> & Pick<ContextItem, "key" | "value" | "category">): ContextItem {
  return {
    id: "should-not-appear",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

test("empty context produces no prompt block", () => {
  assert.equal(formatContextForPrompt([]), null);
});

test("formats category, humanized key, and value only", () => {
  const block = formatContextForPrompt([
    item({ key: "user_name", value: "Sam", category: "user" }),
    item({ key: "assistant_name", value: "Jarvis", category: "assistant" }),
    item({ key: "favourite_colour", value: "blue", category: "preference" }),
  ]);

  assert.ok(block);
  assert.match(block, /Trusted persistent context/);
  assert.match(block, /- user \/ user name: Sam/);
  assert.match(block, /- assistant \/ assistant name: Jarvis/);
  assert.match(block, /- preference \/ favourite colour: blue/);
  assert.doesNotMatch(block, /should-not-appear/);
  assert.doesNotMatch(block, /2026-01-01/);
  assert.doesNotMatch(block, /createdAt|updatedAt|metadata/);
});
