import { getAIProvider } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const provider = getAIProvider();
  const health = await provider.health();
  return Response.json({ provider: provider.id, ...health });
}
