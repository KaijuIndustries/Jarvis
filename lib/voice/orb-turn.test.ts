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

test("follow-up starts only after a finished orb turn", () => {
  const ready = {
    pendingFollowup: true,
    streaming: false,
    speaking: false,
    recording: false,
    transcribing: false,
  };
  assert.equal(shouldStartFollowup(ready), true);
  assert.equal(shouldStartFollowup({ ...ready, speaking: true }), false);
  assert.equal(shouldStartFollowup({ ...ready, streaming: true }), false);
  assert.equal(shouldStartFollowup({ ...ready, recording: true }), false);
  assert.equal(shouldStartFollowup({ ...ready, pendingFollowup: false }), false);
});

test("follow-up stays blocked while speech is still active", () => {
  const ready = {
    pendingFollowup: true,
    streaming: false,
    speaking: true,
    recording: false,
    transcribing: false,
  };
  assert.equal(shouldStartFollowup(ready), false);
});

test("listening starts from a matched wake, a follow-up, or a manual press", () => {
  assert.equal(shouldBeginListening({ source: "wake", phraseMatched: true }), true);
  assert.equal(shouldBeginListening({ source: "wake", phraseMatched: false }), false);
  assert.equal(shouldBeginListening({ source: "followup", phraseMatched: true }), true);
  assert.equal(shouldBeginListening({ source: "manual", phraseMatched: false }), true);
});

test("a closing phrase returns the orb to passive after the turn", () => {
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
