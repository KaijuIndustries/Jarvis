import assert from "node:assert/strict";
import { test } from "node:test";
import {
  float32Rms,
  float32ToInt16,
  isSilentUtterance,
  PCM_RATE,
  resampleInt16Mono,
} from "./pcm.ts";

test("downsamples 48 kHz mono PCM to 16 kHz by averaging groups of three", () => {
  const input = new Int16Array([300, 600, 900, -300, -600, -900]);
  const output = resampleInt16Mono(input, 48_000, 16_000);
  assert.equal(output.length, 2);
  assert.equal(output[0], 600);
  assert.equal(output[1], -600);
});

test("linearly resamples 44.1 kHz audio instead of relabelling the rate", () => {
  const input = new Int16Array(441);
  for (let i = 0; i < input.length; i += 1) input[i] = 1000;
  const output = resampleInt16Mono(input, 44_100, 16_000);
  assert.equal(output.length, 160);
  assert.ok(Math.abs((output[0] ?? 0) - 1000) < 2);
});

test("treats short or quiet recordings as silence", () => {
  const short = float32ToInt16(new Float32Array(PCM_RATE * 0.1).fill(0.2));
  const quiet = float32ToInt16(new Float32Array(PCM_RATE).fill(0.001));
  const spoken = float32ToInt16(new Float32Array(PCM_RATE).fill(0.08));
  assert.equal(isSilentUtterance(short, PCM_RATE), true);
  assert.equal(isSilentUtterance(quiet, PCM_RATE), true);
  assert.equal(isSilentUtterance(spoken, PCM_RATE), false);
});

test("measures RMS of float32 microphone frames", () => {
  assert.equal(float32Rms(new Float32Array()), 0);
  assert.ok(float32Rms(new Float32Array(8).fill(0.5)) > 0.4);
  assert.ok(float32Rms(new Float32Array(8).fill(0.001)) < 0.01);
});
