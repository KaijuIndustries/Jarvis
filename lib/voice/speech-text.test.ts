import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareSpeechText } from "./speech-text.ts";

test("strips markdown emphasis without dropping the spoken answer", () => {
  assert.equal(prepareSpeechText("The answer is **42**."), "The answer is 42.");
  assert.equal(prepareSpeechText("The answer is `4`."), "The answer is 4.");
});

test("unwraps simple math delimiters for Piper", () => {
  assert.equal(prepareSpeechText("The sum is $3.5$."), "The sum is 3.5.");
  assert.equal(prepareSpeechText("Compute \\(2 + 2\\)."), "Compute 2 + 2.");
  assert.equal(prepareSpeechText("2 * 3 equals 6."), "2 times 3 equals 6.");
});

test("returns empty text when nothing speakable remains", () => {
  assert.equal(prepareSpeechText("   "), "");
  assert.equal(prepareSpeechText("****"), "");
});
