export const CONTEXT_CATEGORIES = [
  "user",
  "assistant",
  "preference",
  "other",
] as const;

export type ContextCategory = (typeof CONTEXT_CATEGORIES)[number];

export type ContextItem = {
  id: string;
  key: string;
  value: string;
  category: ContextCategory;
  createdAt: string;
  updatedAt: string;
};

export type ContextInput = {
  key: string;
  value: string;
  category: ContextCategory;
};

export function isContextCategory(value: string): value is ContextCategory {
  return (CONTEXT_CATEGORIES as readonly string[]).includes(value);
}
