import { modelHasTool } from "./access";
import {
  homeAssistantCallServiceTool,
  homeAssistantGetAreasTool,
  homeAssistantGetEntitiesTool,
  homeAssistantGetStateTool,
  homeAssistantUpdateEntityTool,
} from "./home-assistant";
import type { Tool, ToolContext, ToolInput, ToolName, ToolResult } from "./types";
import { isToolName } from "./types";
import { webSearchTool } from "./web-search";

const tools: Record<ToolName, Tool> = {
  web_search: webSearchTool,
  "home_assistant.get_areas": homeAssistantGetAreasTool,
  "home_assistant.get_entities": homeAssistantGetEntitiesTool,
  "home_assistant.get_state": homeAssistantGetStateTool,
  "home_assistant.call_service": homeAssistantCallServiceTool,
  "home_assistant.update_entity": homeAssistantUpdateEntityTool,
};

export function getTool(name: ToolName): Tool {
  return tools[name];
}

export async function runTool(
  name: string,
  input: ToolInput,
  context: ToolContext,
): Promise<ToolResult> {
  if (!isToolName(name)) {
    return {
      ok: false,
      tool: "web_search",
      content: JSON.stringify({ success: false, error: "unknown_tool", name }),
      error: "unknown_tool",
    };
  }
  if (!modelHasTool(context.model, name)) {
    return {
      ok: false,
      tool: name,
      content: JSON.stringify({
        success: false,
        error: "tool_not_allowed",
        message: "This model is not allowed to use that tool",
      }),
      error: "This model is not allowed to use that tool",
    };
  }
  return tools[name].execute(input, context);
}
