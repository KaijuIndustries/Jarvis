import { getAIProvider, type ChatMessage } from "@/lib/ai";
import type {
  ProviderChatMessage,
  ProviderToolCall,
  ProviderToolDefinition,
} from "@/lib/ai/types";
import {
  formatServerDateTime,
  queryNeedsServerTime,
} from "@/lib/ai/server-time";
import { formatContextForPrompt } from "@/lib/context/prompt";
import { selectContextForPrompt } from "@/lib/context/service";
import {
  fetchHomeAssistantAreas,
  formatHomeAssistantCatalog,
  getCachedEntities,
  HOME_ASSISTANT_INSTRUCTIONS,
  isHomeAssistantConfigured,
  settlePendingConfiguration,
} from "@/lib/home-assistant";
import { modelHasHomeAssistantTools, modelHasTool } from "@/lib/tools/access";
import { HOME_ASSISTANT_TOOL_DEFINITIONS } from "@/lib/tools/home-assistant";
import { queryNeedsHomeAssistant } from "@/lib/tools/needs-home";
import { queryNeedsWebSearch } from "@/lib/tools/needs-search";
import { runTool } from "@/lib/tools/registry";
import { isToolName, type ToolInput } from "@/lib/tools/types";

export const runtime = "nodejs";

const MAX_TOOL_ROUNDS = 4;

type ChatRequestBody = {
  model?: string;
  messages?: ChatMessage[];
  conversationId?: string;
};

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ChatMessage>;
  return (
    (message.role === "system" ||
      message.role === "user" ||
      message.role === "assistant") &&
    typeof message.content === "string"
  );
}

async function withOptionalWebSearch(
  model: string,
  messages: ChatMessage[],
  signal: AbortSignal,
  send: (payload: unknown) => void,
): Promise<ChatMessage[]> {
  const lastUser = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  if (!lastUser) return messages;
  if (!modelHasTool(model, "web_search")) return messages;
  if (!queryNeedsWebSearch(lastUser.content)) return messages;

  send({
    content: "",
    done: false,
    tool: { name: "web_search", status: "started" },
  });

  const result = await runTool(
    "web_search",
    { query: lastUser.content },
    { model, signal },
  );

  if (!result.ok) {
    send({
      content: "",
      done: false,
      tool: {
        name: "web_search",
        status: "error",
        message: result.error ?? "Web search unavailable",
      },
    });
    return messages;
  }

  send({
    content: "",
    done: false,
    tool: { name: "web_search", status: "done" },
  });

  const lastUserIndex = messages.lastIndexOf(lastUser);
  return [
    ...messages.slice(0, lastUserIndex),
    { role: "system", content: result.content },
    ...messages.slice(lastUserIndex),
  ];
}

async function withHomeAssistant(
  model: string,
  messages: ChatMessage[],
  signal: AbortSignal,
): Promise<{
  messages: ChatMessage[];
  tools?: ProviderToolDefinition[];
}> {
  if (!isHomeAssistantConfigured() || !modelHasHomeAssistantTools(model)) {
    return { messages };
  }

  const lastUser = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const blocks: ChatMessage[] = [
    { role: "system", content: HOME_ASSISTANT_INSTRUCTIONS },
  ];
  if (lastUser && queryNeedsHomeAssistant(lastUser.content)) {
    try {
      const catalog = formatHomeAssistantCatalog(
        await getCachedEntities({ signal }),
        await fetchHomeAssistantAreas(signal).catch(() => []),
      );
      blocks.push({ role: "system", content: catalog });
    } catch {
      // Chat still works without a catalog; the model can call get_entities.
    }
  }
  return {
    messages: [...blocks, ...messages],
    tools: HOME_ASSISTANT_TOOL_DEFINITIONS,
  };
}

function conversationKey(conversationId: string | undefined, messages: ChatMessage[]): string {
  const explicit = conversationId?.trim();
  if (explicit) return explicit;
  const users = messages.filter((message) => message.role === "user");
  return `fp:${users[0]?.content.slice(0, 80) ?? "unknown"}:${users.length}`;
}

async function streamWithOptionalTools(params: {
  model: string;
  messages: ChatMessage[];
  tools?: ProviderToolDefinition[];
  signal: AbortSignal;
  send: (payload: unknown) => void;
  conversationId?: string;
  requestId?: string;
}): Promise<void> {
  const provider = getAIProvider();
  if (!params.tools?.length) {
    for await (const chunk of provider.chatStream({
      model: params.model,
      messages: params.messages,
      signal: params.signal,
    })) {
      params.send(chunk);
    }
    return;
  }

  let messages: ProviderChatMessage[] = params.messages;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const pendingCalls: ProviderToolCall[] = [];
    for await (const chunk of provider.chatStream({
      model: params.model,
      messages,
      tools: params.tools,
      signal: params.signal,
    })) {
      if (chunk.toolCalls?.length) {
        pendingCalls.push(...chunk.toolCalls);
        continue;
      }
      if (chunk.content) {
        params.send({ content: chunk.content, done: false });
      }
    }

    if (pendingCalls.length === 0) {
      return;
    }

    messages = [
      ...messages,
      {
        role: "assistant",
        content: "",
        tool_calls: pendingCalls.map((call) => ({
          type: "function" as const,
          function: { name: call.name, arguments: call.arguments },
        })),
      },
    ];

    for (const call of pendingCalls) {
      params.send({
        content: "",
        done: false,
        tool: { name: call.name, status: "started" },
      });
      if (!isToolName(call.name) || call.name === "web_search") {
        const denied = JSON.stringify({
          success: false,
          error: "unknown_tool",
          name: call.name,
        });
        params.send({
          content: "",
          done: false,
          tool: { name: call.name, status: "error", message: "unknown_tool" },
        });
        messages = [
          ...messages,
          { role: "tool", tool_name: call.name, content: denied },
        ];
        continue;
      }
      const result = await runTool(call.name, toolInputFromArgs(call.arguments), {
        model: params.model,
        signal: params.signal,
        conversationId: params.conversationId,
        requestId: params.requestId,
      });
      params.send({
        content: "",
        done: false,
        tool: {
          name: call.name,
          status: result.ok ? "done" : "error",
          message: result.error,
        },
      });
      messages = [
        ...messages,
        {
          role: "tool",
          tool_name: call.name,
          content: result.content || JSON.stringify({ success: false, error: result.error }),
        },
      ];
    }
  }
}

const BLOCKED_TOOL_FIELDS = [
  "area_id",
  "device_id",
  "platform",
  "integration",
  "unique_id",
  "disabled_by",
  "hidden_by",
  "new_entity_id",
  "aliases",
  "icon",
  "labels",
  "categories",
  "options",
  "url",
  "method",
  "path",
];

function toolInputFromArgs(args: Record<string, unknown>): ToolInput {
  const entityId = args.entity_id;
  return {
    query: typeof args.query === "string" ? args.query : undefined,
    entity_id:
      typeof entityId === "string" ||
      (Array.isArray(entityId) && entityId.every((id) => typeof id === "string"))
        ? (entityId as string | string[])
        : undefined,
    name: typeof args.name === "string" ? args.name : undefined,
    domain: typeof args.domain === "string" ? args.domain : undefined,
    area: typeof args.area === "string" ? args.area : undefined,
    search: typeof args.search === "string" ? args.search : undefined,
    service: typeof args.service === "string" ? args.service : undefined,
    service_data:
      args.service_data &&
      typeof args.service_data === "object" &&
      !Array.isArray(args.service_data)
        ? (args.service_data as Record<string, unknown>)
        : undefined,
    confirm: args.confirm === true,
    confirmation_id:
      typeof args.confirmation_id === "string" ? args.confirmation_id : undefined,
    unsupported_fields: Object.keys(args).filter((key) =>
      BLOCKED_TOOL_FIELDS.includes(key),
    ),
  };
}

export async function POST(request: Request) {
  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const model = body.model?.trim();
  const messages = Array.isArray(body.messages)
    ? body.messages.filter(isChatMessage)
    : [];
  const requestId = globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}`;
  const conversationId = conversationKey(body.conversationId, messages);

  if (!model) {
    return Response.json({ error: "model is required" }, { status: 400 });
  }
  if (messages.length === 0) {
    return Response.json({ error: "messages are required" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };

      try {
        const contextItems = await selectContextForPrompt(messages);
        const contextBlock = formatContextForPrompt(contextItems);
        const lastUser = [...messages]
          .reverse()
          .find((message) => message.role === "user");
        const timeBlock =
          lastUser && queryNeedsServerTime(lastUser.content)
            ? formatServerDateTime()
            : null;
        const withContext = contextBlock
          ? [{ role: "system" as const, content: contextBlock }, ...messages]
          : messages;
        const withClock = timeBlock
          ? [{ role: "system" as const, content: timeBlock }, ...withContext]
          : withContext;
        const lastUserText = lastUser?.content ?? "";
        const settled = await settlePendingConfiguration(conversationId, lastUserText, {
          signal: request.signal,
          requestId,
        });
        const confirmationNotes: ChatMessage[] = [];
        if (settled.kind === "executed") {
          send({
            content: "",
            done: false,
            tool: { name: "home_assistant.update_entity", status: "done" },
          });
          confirmationNotes.push({
            role: "system",
            content: `A pending Home Assistant configuration change was confirmed and executed:\n${JSON.stringify(settled.payload)}`,
          });
        } else if (settled.kind === "cancelled") {
          confirmationNotes.push({
            role: "system",
            content: settled.payload.message ?? "The pending Home Assistant change was cancelled.",
          });
        }
        const outbound = await withOptionalWebSearch(
          model,
          [...confirmationNotes, ...withClock],
          request.signal,
          send,
        );
        const withHa = await withHomeAssistant(model, outbound, request.signal);
        await streamWithOptionalTools({
          model,
          messages: withHa.messages,
          tools: withHa.tools,
          signal: request.signal,
          send,
          conversationId,
          requestId,
        });
        send({ content: "", done: true });
      } catch (error) {
        if (request.signal.aborted) {
          controller.close();
          return;
        }
        const message =
          error instanceof Error ? error.message : "Chat request failed";
        send({ error: message, done: true });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
