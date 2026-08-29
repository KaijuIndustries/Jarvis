import type {
  ChatStreamChunk,
  ChatStreamParams,
  ModelInfo,
  ProviderHealth,
} from "./types";

/**
 * AI inference provider contract.
 *
 * The UI never talks to Ollama (or any other backend) directly.
 * Route handlers call this interface so additional providers, routing,
 * and tool calling can be introduced behind the same boundary later.
 */
export interface AIProvider {
  readonly id: string;
  listModels(): Promise<ModelInfo[]>;
  health(): Promise<ProviderHealth>;
  chatStream(params: ChatStreamParams): AsyncIterable<ChatStreamChunk>;
}
