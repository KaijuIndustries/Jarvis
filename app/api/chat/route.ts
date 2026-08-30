import { getAIProvider, type ChatMessage } from "@/lib/ai";
import {
  formatServerDateTime,
  queryNeedsServerTime,
} from "@/lib/ai/server-time";
import { formatContextForPrompt } from "@/lib/context/prompt";
import { selectContextForPrompt } from "@/lib/context/service";
import { queryNeedsWebSearch } from "@/lib/tools/needs-search";
import { modelHasTool } from "@/lib/tools/access";
import { runTool } from "@/lib/tools/registry";

export const runtime = "nodejs";

type ChatRequestBody = {
  model?: string;
  messages?: ChatMessage[];
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

  if (!model) {
    return Response.json({ error: "model is required" }, { status: 400 });
  }
  if (messages.length === 0) {
    return Response.json({ error: "messages are required" }, { status: 400 });
  }

  const provider = getAIProvider();
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
        const outbound = await withOptionalWebSearch(
          model,
          withClock,
          request.signal,
          send,
        );
        for await (const chunk of provider.chatStream({
          model,
          messages: outbound,
          signal: request.signal,
        })) {
          send(chunk);
        }
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
