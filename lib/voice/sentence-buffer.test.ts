import assert from "node:assert/strict";
import { test } from "node:test";
import { SentenceBuffer } from "./sentence-buffer.ts";

test("emits a normal sentence once the next one has started", () => {
  const buffer = new SentenceBuffer();
  assert.deepEqual(buffer.push("Hello there. How are you?"), [
    "Hello there.",
  ]);
  assert.deepEqual(buffer.flush(), ["How are you?"]);
});

test("splits multiple sentences in one chunk", () => {
  const buffer = new SentenceBuffer();
  assert.deepEqual(
    buffer.push("One. Two! Three? Four."),
    ["One.", "Two!", "Three?"],
  );
  assert.deepEqual(buffer.flush(), ["Four."]);
});

test("holds a sentence split across chunks until it is complete", () => {
  const buffer = new SentenceBuffer();
  assert.deepEqual(buffer.push("Hello, I think there"), []);
  assert.deepEqual(buffer.push(" are three things we"), []);
  assert.deepEqual(buffer.push(" should consider. The first"), [
    "Hello, I think there are three things we should consider.",
  ]);
  assert.deepEqual(buffer.push(" is your network."), []);
  assert.deepEqual(buffer.flush(), ["The first is your network."]);
});

test("treats question marks as sentence boundaries", () => {
  const buffer = new SentenceBuffer();
  assert.deepEqual(buffer.push("Are you ready? Next we begin."), [
    "Are you ready?",
  ]);
  assert.deepEqual(buffer.flush(), ["Next we begin."]);
});

test("treats exclamation marks as sentence boundaries", () => {
  const buffer = new SentenceBuffer();
  assert.deepEqual(buffer.push("Look out! Something moved."), [
    "Look out!",
  ]);
  assert.deepEqual(buffer.flush(), ["Something moved."]);
});

test("flushes leftover text that has no closing punctuation", () => {
  const buffer = new SentenceBuffer();
  assert.deepEqual(buffer.push("This is still going"), []);
  assert.deepEqual(buffer.flush(), ["This is still going"]);
});

test("does not split decimal numbers such as 3.5", () => {
  const buffer = new SentenceBuffer();
  assert.deepEqual(buffer.push("The value is 3.5 now. Next topic."), [
    "The value is 3.5 now.",
  ]);
  assert.deepEqual(buffer.flush(), ["Next topic."]);
});

test("does not split common abbreviations such as Mr.", () => {
  const buffer = new SentenceBuffer();
  assert.deepEqual(buffer.push("Hello. Mr. Smith is here."), ["Hello."]);
  assert.deepEqual(buffer.flush(), ["Mr. Smith is here."]);
});

test("ignores empty and whitespace-only chunks until real text arrives", () => {
  const buffer = new SentenceBuffer();
  assert.deepEqual(buffer.push(""), []);
  assert.deepEqual(buffer.push("   "), []);
  assert.deepEqual(buffer.push("\n"), []);
  assert.deepEqual(buffer.flush(), []);
});

test("keeps whitespace between chunks so a period can close the sentence", () => {
  const buffer = new SentenceBuffer();
  assert.deepEqual(buffer.push("That is all."), []);
  assert.deepEqual(buffer.push(" "), []);
  assert.deepEqual(buffer.push("Next idea."), ["That is all."]);
  assert.deepEqual(buffer.flush(), ["Next idea."]);
});

test("splits on paragraph breaks without waiting for punctuation", () => {
  const buffer = new SentenceBuffer();
  assert.deepEqual(buffer.push("First paragraph\n\nSecond continues."), [
    "First paragraph",
  ]);
  assert.deepEqual(buffer.flush(), ["Second continues."]);
});

test("does not treat a URL hostname as a sentence end", () => {
  const buffer = new SentenceBuffer();
  assert.deepEqual(
    buffer.push("Visit https://example.com then continue. Done now."),
    ["Visit https://example.com then continue."],
  );
  assert.deepEqual(buffer.flush(), ["Done now."]);
});

test("does not split initials such as U.S.", () => {
  const buffer = new SentenceBuffer();
  assert.deepEqual(buffer.push("The U.S. economy grew. That is notable."), [
    "The U.S. economy grew.",
  ]);
  assert.deepEqual(buffer.flush(), ["That is notable."]);
});
