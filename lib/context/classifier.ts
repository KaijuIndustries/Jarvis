import type { ContextCategory } from "./types";

/**
 * Future memory classifier.
 * Not used this milestone. A later model-based step will choose among these.
 */
export type MemoryDecision = "SAVE" | "UPDATE" | "IGNORE";

export type MemoryCandidate = {
  key: string;
  value: string;
  category: ContextCategory;
  decision: MemoryDecision;
};
