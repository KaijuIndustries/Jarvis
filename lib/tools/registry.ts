import { modelHasTool } from "./access";
import type { Tool, ToolContext, ToolInput, ToolName, ToolResult } from "./types";
import { webSearchTool } from "./web-search";

const tools: Record<ToolName, Tool> = {
  web_search: webSearchTool,
};

export function getTool(name: ToolName): Tool {
  return tools[name];
}

export async function runTool(
  name: ToolName,
  input: ToolInput,
  context: ToolContext,
): Promise<ToolResult> {
  if (!modelHasTool(context.model, name)) {
    return {
      ok: false,
      tool: name,
      content: "",
      error: "This model is not allowed to use that tool",
    };
  }
  return tools[name].execute(input, context);
}
