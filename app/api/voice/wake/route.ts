import { serverConfig } from "@/lib/config";
import { parseWakeAudioResult } from "@/lib/voice/wakeword";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY_BYTES = 32 * 1024;

function wakewordOrigin(): string {
  return `http://${serverConfig.wakewordHost}:${serverConfig.wakewordPort}`;
}

export async function GET() {
  try {
    const response = await fetch(`${wakewordOrigin()}/health`, {
      cache: "no-store",
    });
    const data = (await response.json()) as { ok?: boolean; phrase?: string; error?: string };
    if (!response.ok) {
      return Response.json(
        { ok: false, error: data.error ?? "Wake-word service is unavailable." },
        { status: 503 },
      );
    }
    return Response.json({
      ok: true,
      phrase: data.phrase ?? "Hey Friday",
    });
  } catch {
    return Response.json(
      { ok: false, error: "Wake-word service is unavailable." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  if (request.signal.aborted) {
    return Response.json({ error: "The request was cancelled." }, { status: 499 });
  }

  const session = request.headers.get("x-jarvis-wake-session")?.trim() ?? "";
  if (!session) {
    return Response.json({ type: "error", error: "Missing wake session." }, { status: 400 });
  }

  let body: ArrayBuffer;
  try {
    body = await request.arrayBuffer();
  } catch {
    if (request.signal.aborted) {
      return Response.json({ error: "The request was cancelled." }, { status: 499 });
    }
    return Response.json({ type: "error", error: "The audio could not be processed." }, { status: 400 });
  }

  if (body.byteLength === 0) {
    return Response.json({ type: "ok" });
  }
  if (body.byteLength > MAX_BODY_BYTES) {
    return Response.json({ type: "error", error: "Audio chunk is too large." }, { status: 413 });
  }

  try {
    const response = await fetch(`${wakewordOrigin()}/audio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Jarvis-Wake-Session": session,
      },
      body: new Uint8Array(body),
      cache: "no-store",
      signal: request.signal,
    });
    const data: unknown = await response.json();
    const parsed = parseWakeAudioResult(data);
    return Response.json(parsed, { status: response.ok ? 200 : response.status });
  } catch (error) {
    if (request.signal.aborted) {
      return Response.json({ error: "The request was cancelled." }, { status: 499 });
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      return Response.json({ error: "The request was cancelled." }, { status: 499 });
    }
    return Response.json(
      { type: "error", error: "Wake-word service is unavailable." },
      { status: 503 },
    );
  }
}
