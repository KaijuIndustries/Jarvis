import { serverConfig } from "@/lib/config";
import { VoiceError } from "@/lib/voice/errors";
import {
  synthesizeSpeechOverWyoming,
  synthesizedSpeechToWav,
} from "@/lib/voice/piper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TEXT_CHARS = 8_000;

export async function POST(request: Request) {
  if (request.signal.aborted) {
    return Response.json({ error: "The request was cancelled." }, { status: 499 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    if (request.signal.aborted) {
      return Response.json({ error: "The request was cancelled." }, { status: 499 });
    }
    return Response.json({ error: "Expected JSON with text." }, { status: 400 });
  }

  const text =
    body && typeof body === "object" && "text" in body && typeof body.text === "string"
      ? body.text
      : "";
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return Response.json({ error: "There was nothing to speak." }, { status: 400 });
  }
  if (trimmed.length > MAX_TEXT_CHARS) {
    return Response.json({ error: "The spoken reply is too long." }, { status: 413 });
  }

  try {
    const speech = await synthesizeSpeechOverWyoming({
      host: serverConfig.wyomingPiperHost,
      port: serverConfig.wyomingPiperPort,
      voice: serverConfig.wyomingPiperVoice,
      text: trimmed,
      signal: request.signal,
    });
    const wav = synthesizedSpeechToWav(speech);
    return new Response(Uint8Array.from(wav), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
        "Content-Length": String(wav.length),
      },
    });
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
      { error: "Speech synthesis is unavailable." },
      { status: 503 },
    );
  }
}
