import { ollamaProvider } from "./ollama";
import type { AIProvider } from "./provider";

/**
 * AI router.
 *
 * v1 always selects the local Ollama provider. Later this is the place to
 * add model routing (fast vs reasoning vs coding), multiple Ollama hosts,
 * and specialist backends — without changing the UI or API route shape.
 */
export function getAIProvider(): AIProvider {
  return ollamaProvider;
}
