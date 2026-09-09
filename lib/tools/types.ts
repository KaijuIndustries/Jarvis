export const HOME_ASSISTANT_TOOLS = [
  "home_assistant.get_entities",
  "home_assistant.get_state",
  "home_assistant.call_service",
  "home_assistant.update_entity",
] as const;

export type HomeAssistantToolName = (typeof HOME_ASSISTANT_TOOLS)[number];

export type ToolName = "web_search" | HomeAssistantToolName;

export type ToolContext = {
  model: string;
  signal?: AbortSignal;
  conversationId?: string;
  requestId?: string;
};

export type ToolResult = {
  ok: boolean;
  tool: ToolName;
  /** Text the model may use. Never include secrets. */
  content: string;
  error?: string;
};

export type ToolInput = {
  query?: string;
  entity_id?: string | string[];
  name?: string;
  domain?: string;
  area?: string;
  search?: string;
  service?: string;
  service_data?: Record<string, unknown>;
  confirm?: boolean;
  confirmation_id?: string;
  unsupported_fields?: string[];
};

export interface Tool {
  readonly name: ToolName;
  readonly description: string;
  execute(input: ToolInput, context: ToolContext): Promise<ToolResult>;
}

export function isToolName(name: string): name is ToolName {
  return name === "web_search" || (HOME_ASSISTANT_TOOLS as readonly string[]).includes(name);
}
