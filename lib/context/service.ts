import type { ChatMessage } from "@/lib/ai";
import { query } from "@/lib/db/client";
import {
  isContextCategory,
  type ContextCategory,
  type ContextInput,
  type ContextItem,
} from "./types";

type ContextRow = {
  id: string;
  key: string;
  value: string;
  category: string;
  created_at: Date;
  updated_at: Date;
};

const KEY_MAX = 128;
const VALUE_MAX = 4000;

export class ContextError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ContextError";
    this.status = status;
  }
}

function mapRow(row: ContextRow): ContextItem {
  return {
    id: row.id,
    key: row.key,
    value: row.value,
    category: row.category as ContextCategory,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function normalizeContextKey(raw: string): string {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, KEY_MAX);
  if (!key) {
    throw new ContextError(400, "key is required");
  }
  return key;
}

export function parseContextInput(body: {
  key?: unknown;
  value?: unknown;
  category?: unknown;
}): ContextInput {
  if (typeof body.key !== "string" || typeof body.value !== "string") {
    throw new ContextError(400, "key and value are required");
  }
  if (typeof body.category !== "string" || !isContextCategory(body.category)) {
    throw new ContextError(400, "category is invalid");
  }
  const value = body.value.trim();
  if (!value) {
    throw new ContextError(400, "value is required");
  }
  if (value.length > VALUE_MAX) {
    throw new ContextError(400, "value is too long");
  }
  return {
    key: normalizeContextKey(body.key),
    value,
    category: body.category,
  };
}

export async function listContextItems(): Promise<ContextItem[]> {
  const result = await query<ContextRow>(
    `SELECT id, key, value, category, created_at, updated_at
     FROM context_items
     ORDER BY category ASC, key ASC`,
  );
  return result.rows.map(mapRow);
}

export async function getContextItem(id: string): Promise<ContextItem | null> {
  const result = await query<ContextRow>(
    `SELECT id, key, value, category, created_at, updated_at
     FROM context_items
     WHERE id = $1`,
    [id],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function createContextItem(input: ContextInput): Promise<ContextItem> {
  try {
    const result = await query<ContextRow>(
      `INSERT INTO context_items (key, value, category)
       VALUES ($1, $2, $3)
       RETURNING id, key, value, category, created_at, updated_at`,
      [input.key, input.value, input.category],
    );
    return mapRow(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ContextError(
        409,
        "A context item with that category and key already exists",
      );
    }
    throw error;
  }
}

export async function updateContextItem(
  id: string,
  input: ContextInput,
): Promise<ContextItem> {
  try {
    const result = await query<ContextRow>(
      `UPDATE context_items
       SET key = $2, value = $3, category = $4, updated_at = now()
       WHERE id = $1
       RETURNING id, key, value, category, created_at, updated_at`,
      [id, input.key, input.value, input.category],
    );
    if (!result.rows[0]) {
      throw new ContextError(404, "Context item not found");
    }
    return mapRow(result.rows[0]);
  } catch (error) {
    if (error instanceof ContextError) throw error;
    if (isUniqueViolation(error)) {
      throw new ContextError(
        409,
        "A context item with that category and key already exists",
      );
    }
    throw error;
  }
}

export async function deleteContextItem(id: string): Promise<void> {
  const result = await query("DELETE FROM context_items WHERE id = $1", [id]);
  if (result.rowCount === 0) {
    throw new ContextError(404, "Context item not found");
  }
}

/**
 * Reserved for chat prompt assembly. Returns nothing this milestone
 * so we do not dump the whole context table into every Ollama request.
 */
export async function selectContextForPrompt(
  messages: ChatMessage[],
): Promise<ContextItem[]> {
  void messages;
  return [];
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505",
  );
}
