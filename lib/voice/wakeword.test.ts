import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveOrbState } from "../../components/resolveOrbState.ts";
import { isWakeDetection, parseWakeAudioResult, WAKE_PHRASE } from "./wakeword.ts";

test("accepts a Hey Friday wake event", () => {
  const event = { type: "wake", phrase: WAKE_PHRASE, score: 0.91 };
  assert.equal(isWakeDetection(event), true);
  assert.deepEqual(parseWakeAudioResult(event), event);
});

test("rejects a different wake phrase instead of rewriting it", () => {
  assert.equal(
    isWakeDetection({ type: "wake", phrase: "Hey Jarvis", score: 0.99 }),
    false,
  );
  assert.deepEqual(
    parseWakeAudioResult({ type: "wake", phrase: "Hey Jarvis" }),
    { type: "ok" },
  );
});

test("maps error payloads without dropping the text chat path", () => {
  assert.deepEqual(parseWakeAudioResult({ type: "error", error: "offline" }), {
    type: "error",
    error: "offline",
  });
  assert.deepEqual(parseWakeAudioResult({ type: "ok" }), { type: "ok" });
});

test("wake detection does not change the Orb visual state", () => {
  assert.equal(
    resolveOrbState({
      streaming: false,
      healthOk: true,
      checkingHealth: false,
    }),
    "idle",
  );
  assert.equal(
    resolveOrbState({
      streaming: false,
      healthOk: true,
      checkingHealth: false,
      recording: true,
    }),
    "listening",
  );
  assert.equal(
    resolveOrbState({
      streaming: true,
      healthOk: true,
      checkingHealth: false,
      recording: false,
    }),
    "thinking",
  );
});
