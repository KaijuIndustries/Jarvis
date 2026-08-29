import { getAIProvider } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const provider = getAIProvider();
  try {
    const models = await provider.listModels();
    return Response.json({ provider: provider.id, models });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list models";
    return Response.json(
      { provider: provider.id, models: [], error: message },
      { status: 502 },
    );
  }
}
