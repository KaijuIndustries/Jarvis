export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ModelInfo = {
  /** Provider-native identifier, e.g. "llama3.2:latest". */
  id: string;
  name: string;
  sizeBytes?: number;
  parameterSize?: string;
  quantization?: string;
  modifiedAt?: string;
};

export type ProviderHealth = {
  ok: boolean;
  latencyMs?: number;
  error?: string;
};

export type ChatStreamChunk = {
  content: string;
  done: boolean;
};

export type ChatStreamParams = {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
};
