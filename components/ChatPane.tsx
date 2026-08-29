"use client";

import type { Conversation } from "@/lib/conversations/types";
import { Message } from "./Message";
import { MarkIcon } from "./icons";
import { useEffect, useRef } from "react";

type ChatPaneProps = {
  conversation: Conversation | null;
  streaming: boolean;
  ollamaOk: boolean;
  checking: boolean;
  hasModels: boolean;
  onCopy: (content: string) => void;
  onRegenerate: () => void;
};

export function ChatPane({
  conversation,
  streaming,
  ollamaOk,
  checking,
  hasModels,
  onCopy,
  onRegenerate,
}: ChatPaneProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const messages = conversation?.messages;
  const lastAssistantId = messages
    ?.slice()
    .reverse()
    .find((message) => message.role === "assistant")?.id;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [conversation, streaming]);

  if (!messages || messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-md text-center">
          <MarkIcon className="mx-auto mb-4 h-10 w-10 text-accent" />
          <h1 className="text-lg font-medium tracking-tight">Ready when you are</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {checking
              ? "Looking for Ollama on the configured host."
              : !ollamaOk
                ? "Ollama is unavailable. Start it on this machine, then refresh."
                : !hasModels
                  ? "No models are installed yet. Pull a model with Ollama, then select it above."
                  : "Select a model and send a message. Conversations stay on this device."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="divide-y divide-border/60">
        {messages.map((message) => (
          <Message
            key={message.id}
            message={message}
            streaming={streaming && message.id === lastAssistantId}
            isLastAssistant={
              message.role === "assistant" && message.id === lastAssistantId
            }
            onCopy={() => onCopy(message.content)}
            onRegenerate={
              !streaming &&
              message.role === "assistant" &&
              message.id === lastAssistantId
                ? onRegenerate
                : undefined
            }
          />
        ))}
      </div>
      <div ref={bottomRef} className="h-4" />
    </div>
  );
}
