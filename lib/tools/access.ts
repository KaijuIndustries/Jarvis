import { serverConfig } from "@/lib/config";
import type { ToolName } from "./types";

/**
 * Per-model tool access.
 *
 * v1 is env-configured so we do not hard-code permissions in the UI.
 * Example: WEB_SEARCH_MODELS=llama3.2,qwen3
 */
export function modelHasTool(model: string, tool: ToolName): boolean {
  if (tool !== "web_search") return false;
  const raw = serverConfig.webSearchModels.trim();
  if (!raw) return false;
  if (raw === "*") return true;

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => modelMatches(entry, model));
}

function modelMatches(configured: string, actual: string): boolean {
  if (configured === actual) return true;
  if (!configured.includes(":")) {
    return actual === configured || actual.startsWith(`${configured}:`);
  }
  return false;
}
