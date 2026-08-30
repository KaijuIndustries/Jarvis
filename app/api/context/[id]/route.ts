import {
  ContextError,
  deleteContextItem,
  parseContextInput,
  updateContextItem,
} from "@/lib/context/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

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
    const item = await updateContextItem(id, input);
    return Response.json({ item });
  } catch (error) {
    if (error instanceof ContextError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return databaseError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    await deleteContextItem(id);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ContextError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return databaseError(error);
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "Database error";
  const status = message.includes("DATABASE_URL") ? 503 : 500;
  return Response.json(
    { error: status === 503 ? "Database is not configured" : "Database error" },
    { status },
  );
}
