"use client";

import { useEffect, useRef } from "react";
import type { Conversation } from "@/lib/conversations/types";
import { MarkdownContent } from "./MarkdownContent";

export function OrbConversation(input: {
  conversation: Conversation | null;
  streaming: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const messages = input.conversation?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [input.conversation, input.streaming]);

  if (messages.length === 0) return null;

  return (
    <div className="pointer-events-auto max-h-[32vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-md">
      <div className="flex flex-col gap-3">
        {messages.map((message) => {
          const isUser = message.role === "user";
          return (
            <article key={message.id} className="text-left">
              <p className="text-[10px] font-medium tracking-wide text-white/40">
                {isUser ? "You" : "Friday"}
              </p>
              {isUser ? (
                <p className="whitespace-pre-wrap text-[13px] leading-5 text-white/85">
                  {message.content}
                </p>
              ) : (
                <div className="text-[13px] leading-5 text-white/80">
                  {message.toolStatus ? (
                    <p className="mb-1 text-[11px] text-white/40">{message.toolStatus}</p>
                  ) : null}
                  {message.content ? (
                    <MarkdownContent content={message.content} />
                  ) : input.streaming ? (
                    <p className="text-white/45">Thinking</p>
                  ) : null}
                  {message.error ? (
                    <p className="mt-1 text-[12px] text-[#c47c6e]">{message.error}</p>
                  ) : null}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
