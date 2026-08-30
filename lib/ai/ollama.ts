import { serverConfig } from "@/lib/config";
import type { AIProvider } from "./provider";
import type {
  ChatStreamChunk,
  ChatStreamParams,
  ModelInfo,
  ProviderHealth,
} from "./types";

type OllamaTag = {
  name?: string;
  model?: string;
  size?: number;
  modified_at?: string;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
  };
};

type OllamaChatLine = {
  message?: { content?: string };
  error?: string;
  done?: boolean;
};

function ollamaUrl(path: string): string {
  return new URL(path, `${serverConfig.ollamaBaseUrl.replace(/\/$/, "")}/`).toString();
}

async function* iterateNdjson(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<OllamaChatLine> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        yield JSON.parse(trimmed) as OllamaChatLine;
      }
    }
    if (buffer.trim()) {
      yield JSON.parse(buffer) as OllamaChatLine;
    }
  } finally {
    reader.releaseLock();
  }
}

export const ollamaProvider: AIProvider = {
  id: "ollama",

  async listModels(): Promise<ModelInfo[]> {
    const response = await fetch(ollamaUrl("/api/tags"), {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      throw new Error(`Ollama model list failed (${response.status})`);
    }

    const data = (await response.json()) as { models?: OllamaTag[] };
    const models = (data.models ?? []).map((model) => {
      const id = model.name ?? model.model ?? "";
      return {
        id,
        name: id,
        sizeBytes: model.size,
        parameterSize: model.details?.parameter_size,
        quantization: model.details?.quantization_level,
        modifiedAt: model.modified_at,
      } satisfies ModelInfo;
    });

    return models.filter((model) => model.id.length > 0);
  },

  async health(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const response = await fetch(ollamaUrl("/api/tags"), {
        cache: "no-store",
        signal: AbortSignal.timeout(4_000),
      });
      if (!response.ok) {
        return {
          ok: false,
          latencyMs: Date.now() - started,
          error: `Ollama returned ${response.status}`,
        };
      }
      return { ok: true, latencyMs: Date.now() - started };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : "Ollama unreachable",
      };
    }
  },

  async *chatStream(params: ChatStreamParams): AsyncIterable<ChatStreamChunk> {
    const response = await fetch(ollamaUrl("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: params.signal,
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        stream: true,
        think: false,
      }),
    });

    if (!response.ok) {
      let detail = `Ollama chat failed (${response.status})`;
      try {
        const body = (await response.json()) as { error?: string };
        if (body.error) detail = body.error;
      } catch {
        // Keep the status-based message when the body is not JSON.
      }
      throw new Error(detail);
    }

    if (!response.body) {
      throw new Error("Ollama returned an empty response body");
    }

    for await (const line of iterateNdjson(response.body)) {
      if (line.error) {
        throw new Error(line.error);
      }
      const content = line.message?.content ?? "";
      yield { content, done: Boolean(line.done) };
      if (line.done) return;
    }
  },
};
