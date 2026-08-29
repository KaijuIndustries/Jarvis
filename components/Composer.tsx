"use client";

import {
  useEffect,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { SendIcon, StopIcon } from "./icons";

type ComposerProps = {
  disabled?: boolean;
  streaming: boolean;
  placeholder?: string;
  onSend: (value: string) => void;
  onStop: () => void;
};

export function Composer({
  disabled,
  streaming,
  placeholder,
  onSend,
  onStop,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  useEffect(() => {
    resize();
  }, []);

  function submit() {
    const value = textareaRef.current?.value.trim() ?? "";
    if (!value || disabled || streaming) return;
    onSend(value);
    if (textareaRef.current) {
      textareaRef.current.value = "";
      resize();
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (streaming) {
      onStop();
      return;
    }
    submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-3xl px-4 pb-5 pt-2">
      <div className="rounded-xl border border-border bg-surface shadow-panel focus-within:border-muted/50">
        <textarea
          ref={textareaRef}
          rows={1}
          disabled={disabled || streaming}
          placeholder={placeholder}
          onInput={resize}
          onKeyDown={onKeyDown}
          className="block w-full resize-none bg-transparent px-4 pt-3 pb-2 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted/70 disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-3 px-3 pb-2.5">
          <p className="text-[11px] text-muted">
            Enter to send · Shift+Enter for a new line
          </p>
          <button
            type={streaming ? "button" : "submit"}
            onClick={streaming ? onStop : undefined}
            disabled={!streaming && disabled}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={streaming ? "Stop generation" : "Send message"}
          >
            {streaming ? (
              <StopIcon className="h-3.5 w-3.5" />
            ) : (
              <SendIcon className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
