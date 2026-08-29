import { getAIProvider, type ChatMessage } from "@/lib/ai";

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
        for await (const chunk of provider.chatStream({
          model,
          messages,
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
