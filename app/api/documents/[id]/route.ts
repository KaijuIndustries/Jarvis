import { KnowledgeError, deleteDocument } from "@/lib/knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    await deleteDocument(id);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof KnowledgeError) {
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
