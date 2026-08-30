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

export type ToolEvent = {
  name: string;
  status: "started" | "done" | "error";
  message?: string;
};

export type ChatStreamChunk = {
  content: string;
  done: boolean;
  tool?: ToolEvent;
};

export type ChatStreamParams = {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
};
