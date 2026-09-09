import {
  executeCallService,
  executeGetEntities,
  executeGetState,
  type HaToolPayload,
} from "@/lib/home-assistant";
import type { ProviderToolDefinition } from "@/lib/ai/types";
import type { Tool, ToolContext, ToolInput, ToolName, ToolResult } from "./types";

function toResult(tool: ToolName, payload: HaToolPayload): ToolResult {
  return {
    ok: payload.success,
    tool,
    content: JSON.stringify(payload),
    error: payload.success ? undefined : String(payload.error ?? "error"),
  };
}

function serviceData(input: ToolInput): Record<string, unknown> | undefined {
  return input.service_data && typeof input.service_data === "object"
    ? input.service_data
    : undefined;
}

export const homeAssistantGetEntitiesTool: Tool = {
  name: "home_assistant.get_entities",
  description:
    "Discover Home Assistant entities. Optional filters: domain, area, search. Use this to find devices; use get_state for live state.",

  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const payload = await executeGetEntities(
      {
        domain: input.domain,
        area: input.area,
        search: input.search ?? input.query,
      },
      context.signal,
    );
    return toResult("home_assistant.get_entities", payload);
  },
};

export const homeAssistantGetStateTool: Tool = {
  name: "home_assistant.get_state",
  description:
    "Read the current Home Assistant state for an entity. Prefer entity_id when known; otherwise pass name.",

  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const entityId = Array.isArray(input.entity_id)
      ? input.entity_id[0]
      : input.entity_id;
    const payload = await executeGetState(
      { entity_id: entityId, name: input.name ?? input.search ?? input.query },
      context.signal,
    );
    return toResult("home_assistant.get_state", payload);
  },
};

export const homeAssistantCallServiceTool: Tool = {
  name: "home_assistant.call_service",
  description:
    "Call a Home Assistant service such as light.turn_on or light.turn_off. Pass domain, service, and entity_id or name. Extra parameters go in service_data (for example brightness_pct).",

  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const payload = await executeCallService(
      {
        domain: input.domain,
        service: input.service,
        entity_id: input.entity_id,
        name: input.name ?? input.search ?? input.query,
        service_data: serviceData(input),
      },
      context.signal,
    );
    return toResult("home_assistant.call_service", payload);
  },
};

export const HOME_ASSISTANT_TOOL_DEFINITIONS: ProviderToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "home_assistant.get_entities",
      description: homeAssistantGetEntitiesTool.description,
      parameters: {
        type: "object",
        properties: {
          domain: {
            type: "string",
            description: "Optional Home Assistant domain such as light, switch, or climate",
          },
          area: { type: "string", description: "Optional area or room name filter" },
          search: { type: "string", description: "Optional name or entity_id substring" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "home_assistant.get_state",
      description: homeAssistantGetStateTool.description,
      parameters: {
        type: "object",
        properties: {
          entity_id: { type: "string", description: "Home Assistant entity id, e.g. light.kitchen" },
          name: { type: "string", description: "Friendly name when entity_id is unknown" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "home_assistant.call_service",
      description: homeAssistantCallServiceTool.description,
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Service domain, e.g. light" },
          service: { type: "string", description: "Service name, e.g. turn_off or turn_on" },
          entity_id: {
            description: "Entity id or list of entity ids",
            anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
          },
          name: { type: "string", description: "Friendly name when entity_id is unknown" },
          service_data: {
            type: "object",
            description: "Optional service parameters such as brightness_pct",
          },
        },
        required: ["domain", "service"],
      },
    },
  },
];
