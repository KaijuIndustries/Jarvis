import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldArmWake, shouldStartFollowup } from "./orb-turn.ts";

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
