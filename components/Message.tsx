"use client";

import type { ConversationMessage } from "@/lib/conversations/types";
import { CopyIcon, RefreshIcon, CheckIcon } from "./icons";
import { MarkdownContent } from "./MarkdownContent";
import { useState } from "react";

type MessageProps = {
  message: ConversationMessage;
  streaming?: boolean;
  isLastAssistant?: boolean;
  onCopy: () => void;
  onRegenerate?: () => void;
};

export function Message({
  message,
  streaming,
  isLastAssistant,
  onCopy,
  onRegenerate,
}: MessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  async function copy() {
    onCopy();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <article className="group px-4 py-4">
      <div className="mx-auto flex max-w-3xl gap-4">
        <div
          className={`mt-0.5 h-6 w-6 shrink-0 rounded-md text-[10px] font-semibold tracking-wide ${
            isUser
              ? "bg-surface-2 text-muted"
              : "bg-accent-dim text-accent"
          } flex items-center justify-center`}
          aria-hidden
        >
          {isUser ? "Y" : "J"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <p className="text-[12px] font-medium text-muted">
              {isUser ? "You" : "Jarvis"}
            </p>
            {!isUser ? (
              <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  onClick={copy}
                  className="rounded p-1 text-muted hover:bg-surface-2 hover:text-foreground"
                  aria-label="Copy response"
                >
                  {copied ? (
                    <CheckIcon className="h-3.5 w-3.5" />
                  ) : (
                    <CopyIcon className="h-3.5 w-3.5" />
                  )}
                </button>
                {isLastAssistant && onRegenerate ? (
                  <button
                    type="button"
                    onClick={onRegenerate}
                    className="rounded p-1 text-muted hover:bg-surface-2 hover:text-foreground"
                    aria-label="Regenerate response"
                  >
                    <RefreshIcon className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          {isUser ? (
            <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground">
              {message.content}
            </p>
          ) : (
            <>
              {message.toolStatus ? (
                <p className="mb-2 text-[12px] text-muted">{message.toolStatus}</p>
              ) : null}
              {message.content ? (
                <MarkdownContent content={message.content} />
              ) : streaming ? (
                <p className="text-[15px] text-muted">Thinking</p>
              ) : null}
              {streaming ? <span className="stream-caret" aria-hidden /> : null}
              {message.error ? (
                <p className="mt-2 text-[13px] text-err">{message.error}</p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
