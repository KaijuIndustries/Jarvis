export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ProviderToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ProviderToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export type ProviderChatMessage =
  | ChatMessage
  | {
      role: "assistant";
      content: string;
      tool_calls?: Array<{
        type?: "function";
        function: { name: string; arguments: Record<string, unknown> };
      }>;
    }
  | {
      role: "tool";
      content: string;
      tool_name?: string;
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
  toolCalls?: ProviderToolCall[];
};

export type ChatStreamParams = {
  model: string;
  messages: ProviderChatMessage[];
  signal?: AbortSignal;
  tools?: ProviderToolDefinition[];
};
