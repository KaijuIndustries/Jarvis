import type {
  ChatMessage,
  ChatStreamChunk,
  ModelInfo,
  ProviderHealth,
} from "@/lib/ai";

export type OllamaSettingsStatus = {
  configured: boolean;
  source: "environment" | "server" | null;
};

export async function fetchModels(): Promise<{
  models: ModelInfo[];
  error?: string;
}> {
  const response = await fetch("/api/models", { cache: "no-store" });
  const data = (await response.json()) as { models?: ModelInfo[]; error?: string };
  return {
    models: data.models ?? [],
    error: data.error,
  };
}

export async function fetchHealth(): Promise<ProviderHealth> {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    return (await response.json()) as ProviderHealth;
  } catch {
    return { ok: false, error: "Jarvis API unreachable" };
  }
}

export async function streamChat(params: {
  model: string;
  messages: ChatMessage[];
  signal: AbortSignal;
  onChunk: (chunk: ChatStreamChunk) => void;
}): Promise<void> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
    }),
    signal: params.signal,
  });

  if (!response.ok) {
    let message = `Chat failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the status message.
    }
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error("Empty response from Jarvis API");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const dataLine = event
        .split("\n")
        .find((line) => line.startsWith("data: "));
      if (!dataLine) continue;

      const payload = JSON.parse(dataLine.slice(6)) as ChatStreamChunk & {
        error?: string;
      };
      if (payload.error) {
        throw new Error(payload.error);
      }
      params.onChunk(payload);
    }
  }
}

export async function fetchOllamaSettings(): Promise<OllamaSettingsStatus> {
  const response = await fetch("/api/settings/ollama", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load settings");
  }
  return (await response.json()) as OllamaSettingsStatus;
}

export async function saveOllamaApiKey(
  apiKey: string,
): Promise<OllamaSettingsStatus> {
  const response = await fetch("/api/settings/ollama", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const data = (await response.json()) as OllamaSettingsStatus & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to save API key");
  }
  return data;
}

export async function clearOllamaApiKey(): Promise<OllamaSettingsStatus> {
  const response = await fetch("/api/settings/ollama", { method: "DELETE" });
  if (!response.ok) {
    throw new Error("Failed to clear API key");
  }
  return (await response.json()) as OllamaSettingsStatus;
}
