import {
  KnowledgeError,
  createDocument,
  listDocuments,
} from "@/lib/knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const documents = await listDocuments();
    return Response.json({ documents });
  } catch (error) {
    return databaseError(error);
  }
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file is required" }, { status: 400 });
  }

  try {
    const document = await createDocument(file);
    return Response.json({ document }, { status: 201 });
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
