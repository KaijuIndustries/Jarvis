import { serverConfig } from "@/lib/config";
import { VoiceError } from "@/lib/voice/errors";
import { PCM_CHANNELS, PCM_RATE, PCM_WIDTH } from "@/lib/voice/pcm";
import { normalizeUtterance, transcribeUtterancePcm } from "@/lib/voice/whisper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  if (request.signal.aborted) {
    return Response.json({ error: "The request was cancelled." }, { status: 499 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType && !contentType.startsWith("application/octet-stream")) {
    return Response.json(
      { error: "Expected raw PCM audio." },
      { status: 415 },
    );
  }

  let body: ArrayBuffer;
  try {
    body = await request.arrayBuffer();
  } catch {
    if (request.signal.aborted) {
      return Response.json({ error: "The request was cancelled." }, { status: 499 });
    }
    return Response.json({ error: "The recording could not be processed." }, { status: 400 });
  }

  if (body.byteLength === 0) {
    return Response.json({ text: "" });
  }
  if (body.byteLength > MAX_BODY_BYTES) {
    return Response.json({ error: "The recording is too long." }, { status: 413 });
  }

  const rate = readPositiveInt(request.headers.get("x-jarvis-audio-rate"), PCM_RATE);
  const width = readPositiveInt(request.headers.get("x-jarvis-audio-width"), PCM_WIDTH);
  const channels = readPositiveInt(
    request.headers.get("x-jarvis-audio-channels"),
    PCM_CHANNELS,
  );

  try {
    const normalized = normalizeUtterance({
      bytes: new Uint8Array(body),
      rate,
      width,
      channels,
    });

    if (normalized.silent) {
      return Response.json({ text: "" });
    }

    const text = await transcribeUtterancePcm({
      host: serverConfig.wyomingWhisperHost,
      port: serverConfig.wyomingWhisperPort,
      language: serverConfig.wyomingWhisperLanguage,
      pcm: normalized.pcm,
      signal: request.signal,
    });

    return Response.json({ text });
  } catch (error) {
    if (request.signal.aborted) {
      return Response.json({ error: "The request was cancelled." }, { status: 499 });
    }
    if (error instanceof VoiceError) {
      if (error.code === "cancelled") {
        return Response.json({ error: error.message }, { status: 499 });
      }
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: "Speech recognition is unavailable." },
      { status: 503 },
    );
  }
}

function readPositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}
