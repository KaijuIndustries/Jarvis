import {
  clearOllamaApiKey,
  getOllamaApiKeyStatus,
  saveOllamaApiKey,
} from "@/lib/secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getOllamaApiKeyStatus());
}

export async function POST(request: Request) {
  let body: { apiKey?: unknown };
  try {
    body = (await request.json()) as { apiKey?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.apiKey !== "string") {
    return Response.json({ error: "apiKey is required" }, { status: 400 });
  }

  const apiKey = body.apiKey.trim();
  if (!apiKey) {
    return Response.json({ error: "apiKey is required" }, { status: 400 });
  }
  if (apiKey.length > 512) {
    return Response.json({ error: "apiKey is too long" }, { status: 400 });
  }

  const status = await saveOllamaApiKey(apiKey);
  return Response.json(status);
}

export async function DELETE() {
  return Response.json(await clearOllamaApiKey());
}
