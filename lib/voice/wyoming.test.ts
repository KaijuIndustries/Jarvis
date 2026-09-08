import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeWyomingEvent, WyomingEventParser } from "./wyoming-protocol.ts";

test("encodes Wyoming events as a JSON header plus optional data and payload", () => {
  const encoded = encodeWyomingEvent({
    type: "audio-chunk",
    data: { rate: 16000, width: 2, channels: 1 },
    payload: Buffer.from([1, 2, 3, 4]),
  });

  const newline = encoded.indexOf(0x0a);
  const header = JSON.parse(encoded.subarray(0, newline).toString("utf8")) as {
    type: string;
    data_length: number;
    payload_length: number;
  };
  assert.equal(header.type, "audio-chunk");
  assert.equal(header.payload_length, 4);

  const data = JSON.parse(
    encoded.subarray(newline + 1, newline + 1 + header.data_length).toString("utf8"),
  ) as { rate: number; width: number; channels: number };
  assert.deepEqual(data, { rate: 16000, width: 2, channels: 1 });
  assert.deepEqual(
    [...encoded.subarray(newline + 1 + header.data_length)],
    [1, 2, 3, 4],
  );
});

test("parses header-inline data and split data_length payloads", () => {
  const parser = new WyomingEventParser();
  parser.push(Buffer.from('{"type":"transcript","data":{"text":"Hello"}}\n'));
  assert.deepEqual(parser.pull(), {
    type: "transcript",
    data: { text: "Hello" },
    payload: undefined,
  });

  const encoded = encodeWyomingEvent({
    type: "audio-start",
    data: { rate: 16000, width: 2, channels: 1 },
  });
  parser.push(encoded);
  assert.deepEqual(parser.pull(), {
    type: "audio-start",
    data: { rate: 16000, width: 2, channels: 1 },
    payload: undefined,
  });
});
