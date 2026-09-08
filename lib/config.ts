/**
 * Server-side infrastructure configuration.
 * All host/service URLs come from environment variables so Ollama, Whisper,
 * and later other providers can move to another machine without code changes.
 */
function readEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

export const serverConfig = {
  databaseUrl: process.env.DATABASE_URL?.trim() ?? "",
  ollamaBaseUrl: readEnv("OLLAMA_BASE_URL", "http://localhost:11434"),
  /**
   * Ollama's hosted web search API (not the local inference server).
   * https://docs.ollama.com/capabilities/web-search
   */
  ollamaWebSearchUrl: readEnv(
    "OLLAMA_WEB_SEARCH_URL",
    "https://ollama.com/api/web_search",
  ),
  /**
   * Models allowed to use the web_search tool.
   * "*" = all models. Comma-separated IDs otherwise (e.g. "llama3.2,qwen3").
   */
  webSearchModels: readEnv("WEB_SEARCH_MODELS", "*"),
  ...parseWyomingWhisperTarget(readEnv("WYOMING_WHISPER_URL", "127.0.0.1:10300")),
  wyomingWhisperLanguage: readEnv("WYOMING_WHISPER_LANGUAGE", "en"),
} as const;

function parseWyomingWhisperTarget(value: string): {
  wyomingWhisperHost: string;
  wyomingWhisperPort: number;
} {
  const raw = value.replace(/^tcp:\/\//i, "").trim();
  const separator = raw.lastIndexOf(":");
  if (separator <= 0) {
    return { wyomingWhisperHost: "127.0.0.1", wyomingWhisperPort: 10300 };
  }
  const host = raw.slice(0, separator).trim() || "127.0.0.1";
  const port = Number(raw.slice(separator + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { wyomingWhisperHost: host, wyomingWhisperPort: 10300 };
  }
  return { wyomingWhisperHost: host, wyomingWhisperPort: port };
}
