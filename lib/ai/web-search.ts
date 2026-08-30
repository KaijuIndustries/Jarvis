import { serverConfig } from "@/lib/config";
import { getOllamaApiKey } from "@/lib/secrets";

export type WebSearchHit = {
  title: string;
  url: string;
  content: string;
};

export type WebSearchErrorCode =
  | "missing_key"
  | "invalid_key"
  | "unavailable"
  | "timeout"
  | "invalid_response";

export class WebSearchError extends Error {
  readonly code: WebSearchErrorCode;

  constructor(code: WebSearchErrorCode, message: string) {
    super(message);
    this.name = "WebSearchError";
    this.code = code;
  }
}

type SearchApiResponse = {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
  }>;
  error?: string;
};

/**
 * Ollama hosted web search. The API key is attached only here, server-side.
 * https://docs.ollama.com/capabilities/web-search
 */
export async function ollamaWebSearch(params: {
  query: string;
  maxResults?: number;
  signal?: AbortSignal;
}): Promise<WebSearchHit[]> {
  const query = params.query.trim();
  if (!query) {
    throw new WebSearchError("invalid_response", "Search query is empty");
  }

  const { key } = await getOllamaApiKey();
  if (!key) {
    throw new WebSearchError(
      "missing_key",
      "Ollama API key is not configured",
    );
  }

  const maxResults = Math.min(Math.max(params.maxResults ?? 5, 1), 10);
  const signal = withTimeout(params.signal, 15_000);

  let response: Response;
  try {
    response = await fetch(serverConfig.ollamaWebSearchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
      }),
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new WebSearchError("timeout", "Web search timed out");
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    throw new WebSearchError(
      "unavailable",
      "Ollama web search is unreachable",
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new WebSearchError("invalid_key", "Ollama API key was rejected");
  }

  if (!response.ok) {
    throw new WebSearchError(
      "unavailable",
      `Web search unavailable (${response.status})`,
    );
  }

  let body: SearchApiResponse;
  try {
    body = (await response.json()) as SearchApiResponse;
  } catch {
    throw new WebSearchError(
      "invalid_response",
      "Web search returned an invalid response",
    );
  }

  const results = (body.results ?? [])
    .map((item) => ({
      title: item.title?.trim() ?? "",
      url: item.url?.trim() ?? "",
      content: item.content?.trim() ?? "",
    }))
    .filter((item) => item.title || item.url || item.content);

  return results;
}

export function formatSearchResultsForModel(hits: WebSearchHit[]): string {
  if (hits.length === 0) {
    return "Web search returned no results.";
  }

  const lines = hits.map((hit, index) => {
    const snippet = hit.content.slice(0, 500);
    return `${index + 1}. ${hit.title || "Untitled"}\n   ${hit.url}\n   ${snippet}`;
  });

  return [
    "Web search results. Use these facts if they help answer the user. Cite titles/URLs when useful. Do not mention API keys.",
    ...lines,
  ].join("\n\n");
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  if (!signal) return timeout;
  const any = (
    AbortSignal as typeof AbortSignal & {
      any?: (signals: AbortSignal[]) => AbortSignal;
    }
  ).any;
  return typeof any === "function" ? any([signal, timeout]) : timeout;
}
