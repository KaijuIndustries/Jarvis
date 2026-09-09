import assert from "node:assert/strict";
import { test } from "node:test";
import { pcmToWav } from "./wav.ts";
import { encodeWyomingEvent, WyomingEventParser } from "./wyoming-protocol.ts";

test("encodes a Wyoming synthesize event for the Piper voice", () => {
  const encoded = encodeWyomingEvent({
    type: "synthesize",
    data: {
      text: "Hello there.",
      voice: { name: "en_GB-alba-medium" },
    },
  });
  const parser = new WyomingEventParser();
  parser.push(encoded);
  assert.deepEqual(parser.pull(), {
    type: "synthesize",
    data: {
      text: "Hello there.",
      voice: { name: "en_GB-alba-medium" },
    },
    payload: undefined,
  });
});

test("wraps raw PCM in a browser-playable WAV header", () => {
  const pcm = Buffer.from([0, 0, 0, 16]);
  const wav = pcmToWav(pcm, 22050, 2, 1);
  assert.equal(wav.length, 48);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.readUInt32LE(24), 22050);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.deepEqual([...wav.subarray(44)], [0, 0, 0, 16]);
});
