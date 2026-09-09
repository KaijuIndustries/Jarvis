import assert from "node:assert/strict";
import { test } from "node:test";
import {
  shouldArmWake,
  shouldBeginListening,
  shouldReturnToPassive,
  shouldStartFollowup,
} from "./orb-turn.ts";

test("wake is armed only in passive idle", () => {
  const idle = {
    mode: "passive" as const,
    recording: false,
    transcribing: false,
    streaming: false,
    speaking: false,
  };
  assert.equal(shouldArmWake(idle), true);
  assert.equal(shouldArmWake({ ...idle, mode: "command" }), false);
  assert.equal(shouldArmWake({ ...idle, mode: "followup" }), false);
  assert.equal(shouldArmWake({ ...idle, recording: true }), false);
  assert.equal(shouldArmWake({ ...idle, speaking: true }), false);
  assert.equal(shouldArmWake({ ...idle, streaming: true }), false);
});

test("follow-up never starts listening on its own", () => {
  const ready = {
    pendingFollowup: true,
    streaming: false,
    speaking: false,
    recording: false,
    transcribing: false,
  };
  assert.equal(shouldStartFollowup(ready), false);
  assert.equal(shouldStartFollowup({ ...ready, pendingFollowup: false }), false);
});

test("listening starts only from a matched wake word or a manual press", () => {
  assert.equal(shouldBeginListening({ source: "wake", phraseMatched: true }), true);
  assert.equal(shouldBeginListening({ source: "wake", phraseMatched: false }), false);
  assert.equal(shouldBeginListening({ source: "followup", phraseMatched: true }), false);
  assert.equal(shouldBeginListening({ source: "manual", phraseMatched: false }), true);
});

test("the orb returns to passive after a finished turn instead of listening", () => {
  const done = {
    turnInProgress: true,
    sawBusy: true,
    streaming: false,
    speaking: false,
    recording: false,
    transcribing: false,
  };
  assert.equal(shouldReturnToPassive(done), true);
  assert.equal(shouldReturnToPassive({ ...done, speaking: true }), false);
  assert.equal(shouldReturnToPassive({ ...done, streaming: true }), false);
  assert.equal(shouldReturnToPassive({ ...done, sawBusy: false }), false);
  assert.equal(shouldReturnToPassive({ ...done, turnInProgress: false }), false);
});
