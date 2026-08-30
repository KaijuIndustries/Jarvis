import {
  formatSearchResultsForModel,
  ollamaWebSearch,
  WebSearchError,
} from "@/lib/ai/web-search";
import type { Tool, ToolContext, ToolInput, ToolResult } from "./types";

export const webSearchTool: Tool = {
  name: "web_search",
  description:
    "Search the public web through Ollama Web Search when current information is needed.",

  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const query = input.query?.trim() ?? "";
    try {
      const hits = await ollamaWebSearch({
        query,
        signal: context.signal,
      });
      return {
        ok: true,
        tool: "web_search",
        content: formatSearchResultsForModel(hits),
      };
    } catch (error) {
      if (error instanceof WebSearchError) {
        return {
          ok: false,
          tool: "web_search",
          content: "",
          error: error.message,
        };
      }
      if (error instanceof Error && error.name === "AbortError") {
        return {
          ok: false,
          tool: "web_search",
          content: "",
          error: "Web search was cancelled",
        };
      }
      return {
        ok: false,
        tool: "web_search",
        content: "",
        error: "Web search failed",
      };
    }
  },
};
