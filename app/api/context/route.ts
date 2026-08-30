import {
  ContextError,
  createContextItem,
  listContextItems,
  parseContextInput,
} from "@/lib/context/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await listContextItems();
    return Response.json({ items });
  } catch (error) {
    return databaseError(error);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const input = parseContextInput(
      body && typeof body === "object" ? (body as Record<string, unknown>) : {},
    );
    const item = await createContextItem(input);
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof ContextError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return databaseError(error);
  }
}

function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "Database error";
  const status = message.includes("DATABASE_URL") ? 503 : 500;
  return Response.json(
    { error: status === 503 ? "Database is not configured" : "Database error" },
    { status },
  );
}
