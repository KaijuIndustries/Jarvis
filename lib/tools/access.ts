import { serverConfig } from "@/lib/config";
import { HOME_ASSISTANT_TOOLS, type ToolName } from "./types";

/**
 * Per-model tool access.
 *
 * v1 is env-configured so we do not hard-code permissions in the UI.
 * Example: WEB_SEARCH_MODELS=llama3.2,qwen3
 */
export function modelHasTool(model: string, tool: ToolName): boolean {
  if (tool === "web_search") {
    return modelListAllows(serverConfig.webSearchModels, model);
  }
  if ((HOME_ASSISTANT_TOOLS as readonly string[]).includes(tool)) {
    if (!serverConfig.homeAssistantUrl) return false;
    return modelListAllows(serverConfig.homeAssistantModels, model);
  }
  return false;
}

export function modelHasHomeAssistantTools(model: string): boolean {
  return modelHasTool(model, "home_assistant.get_entities");
}

function modelListAllows(raw: string, model: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (trimmed === "*") return true;

  return trimmed
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
