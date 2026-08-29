/**
 * Server-side infrastructure configuration.
 * All host/service URLs come from environment variables so Ollama (and
 * later other providers) can move to another machine without code changes.
 */
function readEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

export const serverConfig = {
  ollamaBaseUrl: readEnv("OLLAMA_BASE_URL", "http://localhost:11434"),
} as const;
