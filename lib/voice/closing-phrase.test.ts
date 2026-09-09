import assert from "node:assert/strict";
import { test } from "node:test";
import { isConversationClosingPhrase, shouldExpectFollowup } from "./closing-phrase.ts";

test("clear closing phrases return true", () => {
  const closers = [
    "no that's all",
    "that's all",
    "that's all thanks",
    "thanks Friday",
    "thank you Friday",
    "I don't need any more help",
    "that's everything",
    "that's it",
    "I'm done",
    "no more questions",
    "you've answered my question",
  ];
  for (const phrase of closers) {
    assert.equal(isConversationClosingPhrase(phrase), true, phrase);
  }
});

test("normal conversational statements return false", () => {
  const ongoing = [
    "What's the capital of France?",
    "And what's the population?",
    "Tell me about the weather tomorrow",
    "How do I restart the service",
    "yes",
    "no",
    "okay continue",
    "Friday what time is it",
  ];
  for (const phrase of ongoing) {
    assert.equal(isConversationClosingPhrase(phrase), false, phrase);
  }
});

test("closing phrase containing a new question or request returns false", () => {
  const mixed = [
    "Thanks, but how do I do the other one?",
    "That's all, but what about X?",
    "that's all, but what about the weather",
    "thanks Friday can you also set a timer",
    "I'm done after you explain the next step",
    "thank you, now send the email",
  ];
  for (const phrase of mixed) {
    assert.equal(isConversationClosingPhrase(phrase), false, phrase);
  }
});

test("case, punctuation, and extra whitespace variations are handled", () => {
  assert.equal(isConversationClosingPhrase("  THANKS FRIDAY!!  "), true);
  assert.equal(isConversationClosingPhrase("That's all, thanks."), true);
  assert.equal(isConversationClosingPhrase("No, that’s all"), true);
  assert.equal(isConversationClosingPhrase("i am done"), true);
  assert.equal(isConversationClosingPhrase("Thank you, Friday"), true);
  assert.equal(isConversationClosingPhrase("ok that's all thanks"), true);
});

test("closing decision only skips follow-up and still leaves a message to send", () => {
  const transcript = "thanks Friday";
  assert.equal(isConversationClosingPhrase(transcript), true);
  assert.equal(shouldExpectFollowup(transcript), false);
  assert.ok(transcript.trim().length > 0);

  const question = "What's the capital of France?";
  assert.equal(isConversationClosingPhrase(question), false);
  assert.equal(shouldExpectFollowup(question), true);
  assert.ok(question.trim().length > 0);

  assert.equal(shouldExpectFollowup("   "), false);
});
