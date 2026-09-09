import { invalidSpeech, ttsClosed, ttsTimeout, ttsUnavailable, VoiceError } from "./errors";
import { pcmToWav } from "./wav";
import {
  withWyomingSocket,
  type WyomingConnection,
  type WyomingEvent,
} from "./wyoming";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_PCM_BYTES = 20 * 1024 * 1024;

export type SynthesizedSpeech = {
  pcm: Buffer;
  rate: number;
  width: number;
  channels: number;
};

export function synthesizeEvent(text: string, voice: string): WyomingEvent {
  return {
    type: "synthesize",
    data: {
      text,
      voice: { name: voice },
    },
  };
}

export async function collectSynthesizedPcm(
  connection: WyomingConnection,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<SynthesizedSpeech> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(ttsTimeout()), timeoutMs);
  });

  const chunks: Buffer[] = [];
  let rate = 0;
  let width = 0;
  let channels = 0;

  try {
    while (true) {
      if (signal?.aborted) {
        throw new VoiceError(499, "The request was cancelled.", "cancelled");
      }

      const event = await Promise.race([connection.read(), timeout]);
      if (event.type === "error") {
        const message =
          typeof event.data.text === "string" && event.data.text.trim()
            ? event.data.text
            : "Speech synthesis failed.";
        throw new VoiceError(502, message, "piper_error");
      }

      if (event.type === "audio-start") {
        rate = asPositiveInt(event.data.rate, rate);
        width = asPositiveInt(event.data.width, width);
        channels = asPositiveInt(event.data.channels, channels);
        continue;
      }

      if (event.type === "audio-chunk") {
        rate = asPositiveInt(event.data.rate, rate);
        width = asPositiveInt(event.data.width, width);
        channels = asPositiveInt(event.data.channels, channels);
        if (event.payload && event.payload.length > 0) {
          chunks.push(event.payload);
        }
        const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        if (total > MAX_PCM_BYTES) {
          throw new VoiceError(413, "The spoken reply is too long.", "piper_too_long");
        }
        continue;
      }

      if (event.type === "audio-stop") {
        const pcm = Buffer.concat(chunks);
        if (pcm.length === 0) {
          throw new VoiceError(502, "Speech synthesis returned no audio.", "piper_empty");
        }
        if (rate < 8_000 || width < 1 || channels < 1) {
          throw new VoiceError(502, "Speech synthesis returned invalid audio.", "piper_format");
        }
        return { pcm, rate, width, channels };
      }
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function synthesizeSpeechOverWyoming(options: {
  host: string;
  port: number;
  voice: string;
  text: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<SynthesizedSpeech> {
  const text = options.text.replace(/\s+/g, " ").trim();
  if (!text) {
    throw invalidSpeech();
  }

  return withWyomingSocket({
    host: options.host,
    port: options.port,
    signal: options.signal,
    unavailable: ttsUnavailable,
    closed: ttsClosed,
    run: async (connection) => {
      connection.write(synthesizeEvent(text, options.voice));
      return collectSynthesizedPcm(
        connection,
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        options.signal,
      );
    },
  });
}

export function synthesizedSpeechToWav(speech: SynthesizedSpeech): Buffer {
  return pcmToWav(speech.pcm, speech.rate, speech.width, speech.channels);
}

function asPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}
