import { invalidAudio, VoiceError } from "./errors";
import {
  assertPcmLimits,
  bytesToInt16,
  int16ToBytes,
  isSilentUtterance,
  PCM_CHANNELS,
  PCM_RATE,
  PCM_WIDTH,
  pcmDurationSeconds,
  resampleInt16Mono,
} from "./pcm";
import { transcribePcmOverWyoming } from "./wyoming";

export type NormalizedPcm = {
  pcm: Buffer;
  silent: boolean;
};

export function normalizeUtterance(input: {
  bytes: Uint8Array;
  rate: number;
  width: number;
  channels: number;
}): NormalizedPcm {
  if (input.width !== PCM_WIDTH) {
    throw invalidAudio();
  }
  if (input.channels !== PCM_CHANNELS) {
    throw invalidAudio();
  }
  if (!Number.isInteger(input.rate) || input.rate < 8_000 || input.rate > 96_000) {
    throw invalidAudio();
  }
  if (input.bytes.byteLength < 2 || input.bytes.byteLength % 2 !== 0) {
    throw invalidAudio();
  }

  try {
    assertPcmLimits(input.bytes.byteLength, input.rate, input.width, input.channels);
  } catch {
    throw new VoiceError(413, "The recording is too long.", "too_long");
  }

  if (pcmDurationSeconds(input.bytes.byteLength, input.rate, input.width, input.channels) > 31) {
    throw new VoiceError(413, "The recording is too long.", "too_long");
  }

  let samples = bytesToInt16(input.bytes);
  if (input.rate !== PCM_RATE) {
    samples = resampleInt16Mono(samples, input.rate, PCM_RATE);
  }

  return {
    pcm: Buffer.from(int16ToBytes(samples)),
    silent: isSilentUtterance(samples, PCM_RATE),
  };
}

export async function transcribeUtterancePcm(input: {
  host: string;
  port: number;
  language: string;
  pcm: Buffer;
  signal?: AbortSignal;
}): Promise<string> {
  const text = await transcribePcmOverWyoming({
    host: input.host,
    port: input.port,
    language: input.language,
    pcm: input.pcm,
    rate: PCM_RATE,
    width: PCM_WIDTH,
    channels: PCM_CHANNELS,
    signal: input.signal,
  });
  return text.replace(/\s+/g, " ").trim();
}
