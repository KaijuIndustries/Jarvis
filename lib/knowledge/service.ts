import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { query } from "@/lib/db/client";
import type { DocumentStatus, KnowledgeDocument } from "./types";

type DocumentRow = {
  id: string;
  original_filename: string;
  stored_filename: string;
  mime_type: string;
  size_bytes: string | number;
  storage_path: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
};

const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export class KnowledgeError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "KnowledgeError";
    this.status = status;
  }
}

function uploadsDir(): string {
  return path.join(process.cwd(), "data", "uploads");
}

function mapRow(row: DocumentRow): KnowledgeDocument {
  return {
    id: row.id,
    filename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    status: row.status as DocumentStatus,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function displayNameFromUpload(name: string): string {
  const base = path.basename(name.replaceAll("\\", "/")).trim();
  if (!base || base === "." || base === "..") {
    throw new KnowledgeError(400, "Invalid filename");
  }
  return base.slice(0, 255);
}

function resolveType(
  filename: string,
  mimeType: string,
): { ext: string; mimeType: string } {
  const ext = path.extname(filename).toLowerCase();
  const inferred = MIME_BY_EXTENSION[ext];
  if (!inferred) {
    throw new KnowledgeError(
      400,
      "Unsupported file type. Use PDF, TXT, Markdown, PNG, JPEG, or DOCX.",
    );
  }
  if (
    mimeType &&
    mimeType !== "application/octet-stream" &&
    !ALLOWED_TYPES[mimeType]?.includes(ext)
  ) {
    throw new KnowledgeError(400, "File extension does not match its type");
  }
  return { ext, mimeType: ALLOWED_TYPES[mimeType] ? mimeType : inferred };
}

export async function listDocuments(): Promise<KnowledgeDocument[]> {
  const result = await query<DocumentRow>(
    `SELECT id, original_filename, stored_filename, mime_type, size_bytes,
            storage_path, status, created_at, updated_at
     FROM documents
     ORDER BY created_at DESC`,
  );
  return result.rows.map(mapRow);
}

export async function createDocument(file: File): Promise<KnowledgeDocument> {
  if (file.size <= 0) {
    throw new KnowledgeError(400, "File is empty");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new KnowledgeError(400, "File is too large (20 MB maximum)");
  }

  const originalFilename = displayNameFromUpload(file.name);
  const { ext, mimeType } = resolveType(
    originalFilename,
    file.type || "application/octet-stream",
  );
  const id = crypto.randomUUID();
  const storedFilename = `${id}${ext}`;
  const relativePath = path.posix.join("data", "uploads", storedFilename);
  const absolutePath = path.join(uploadsDir(), storedFilename);

  const resolved = path.resolve(absolutePath);
  const allowedRoot = path.resolve(uploadsDir());
  if (!resolved.startsWith(allowedRoot + path.sep)) {
    throw new KnowledgeError(400, "Invalid storage path");
  }

  await mkdir(allowedRoot, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(resolved, bytes, { mode: 0o600 });

  try {
    const result = await query<DocumentRow>(
      `INSERT INTO documents (
         id, original_filename, stored_filename, mime_type, size_bytes, storage_path, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'stored')
       RETURNING id, original_filename, stored_filename, mime_type, size_bytes,
                 storage_path, status, created_at, updated_at`,
      [id, originalFilename, storedFilename, mimeType, file.size, relativePath],
    );
    return mapRow(result.rows[0]);
  } catch (error) {
    await unlink(resolved).catch(() => undefined);
    throw error;
  }
}

export async function deleteDocument(id: string): Promise<void> {
  const result = await query<DocumentRow>(
    `DELETE FROM documents
     WHERE id = $1
     RETURNING id, original_filename, stored_filename, mime_type, size_bytes,
               storage_path, status, created_at, updated_at`,
    [id],
  );
  const row = result.rows[0];
  if (!row) {
    throw new KnowledgeError(404, "Document not found");
  }

  const storedName = path.basename(row.stored_filename);
  if (storedName && storedName === row.stored_filename) {
    await unlink(path.join(uploadsDir(), storedName)).catch(() => undefined);
  }
}
