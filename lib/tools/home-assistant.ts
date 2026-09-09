import {
  executeCallService,
  executeGetAreas,
  executeGetEntities,
  executeGetState,
  executeUpdateEntity,
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

export const homeAssistantGetAreasTool: Tool = {
  name: "home_assistant.get_areas",
  description:
    "List Home Assistant rooms by friendly name. kitchen and Kitchen are the same. Use the name with update_entity; never pass an area_id or ask about capitalisation.",

  async execute(_input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const payload = await executeGetAreas(context.signal);
    return toResult("home_assistant.get_areas", payload);
  },
};

export const homeAssistantGetEntitiesTool: Tool = {
  name: "home_assistant.get_entities",
  description:
    "Discover Home Assistant devices. Returns friendly name, room, and an internal entity_id. Speak and search with the friendly name. Optional filters: domain, area, search.",

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
    "Read the current Home Assistant state. Prefer the friendly name; entity_id is internal only.",

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

export const homeAssistantUpdateEntityTool: Tool = {
  name: "home_assistant.update_entity",
  description:
    "Move or rename a device using its friendly name, e.g. Hue Play 1. Pass the room as a normal name such as Kitchen; capitalisation does not matter. Never pass area_id or speak entity IDs to the user. Requires confirmation. Do not use this to turn devices on or off.",

  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    const entityId = Array.isArray(input.entity_id)
      ? input.entity_id
      : input.entity_id;
    const payload = await executeUpdateEntity(
      {
        entity_id: entityId,
        name: input.name,
        area: input.area,
        search: input.search ?? input.query,
        confirm: input.confirm,
        confirmation_id: input.confirmation_id,
        unsupported_fields: input.unsupported_fields,
      },
      {
        signal: context.signal,
        conversationId: context.conversationId,
        requestId: context.requestId,
      },
    );
    return toResult("home_assistant.update_entity", payload);
  },
};

export const HOME_ASSISTANT_TOOL_DEFINITIONS: ProviderToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "home_assistant.get_areas",
      description: homeAssistantGetAreasTool.description,
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
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
          area: { type: "string", description: "Optional room name filter. Case does not matter." },
          search: { type: "string", description: "Optional friendly name substring, e.g. Hue Play 1" },
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
          entity_id: { type: "string", description: "Internal id if already known. Prefer name." },
          name: { type: "string", description: "Friendly device name, e.g. Living Room Light" },
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
            description: "Internal id if already known. Prefer name for spoken devices.",
            anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
          },
          name: { type: "string", description: "Friendly device name, e.g. Hue Play 1" },
          service_data: {
            type: "object",
            description: "Optional service parameters such as brightness_pct",
          },
        },
        required: ["domain", "service"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "home_assistant.update_entity",
      description: homeAssistantUpdateEntityTool.description,
      parameters: {
        type: "object",
        properties: {
          entity_id: {
            type: "string",
            description: "Optional internal id. Prefer search with the friendly name.",
          },
          search: {
            type: "string",
            description: "Friendly device name to move or rename, e.g. Hue Play 1",
          },
          area: {
            type: "string",
            description: "Target room name, e.g. Kitchen. Case does not matter. Do not pass area_id.",
          },
          name: {
            type: "string",
            description: "New friendly name. This is the rename value, not the lookup name.",
          },
        },
      },
    },
  },
];
