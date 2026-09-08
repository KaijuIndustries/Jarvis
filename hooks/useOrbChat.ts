"use client";

import { useEffect, useRef, useState } from "react";
import { fetchModels, streamChat } from "@/lib/client/api";
import { getSessionSnapshot } from "@/lib/conversations/session";

/**
 * One-shot Orb voice turn: a finished Whisper transcript → /api/chat.
 * Does not use JarvisProvider or conversation persistence.
 */
export function useOrbChat(input: {
  transcript: string | null;
  recording: boolean;
  transcribing: boolean;
}) {
  const [streaming, setStreaming] = useState(false);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const consumedRef = useRef(false);

  useEffect(() => {
    if (input.recording || input.transcribing) {
      consumedRef.current = false;
      return;
    }

    const text = input.transcript?.trim() ?? "";
    if (!text || consumedRef.current) return;
    consumedRef.current = true;

    const controller = new AbortController();
    setError(null);
    setReply("");
    setPrompt(text);
    setStreaming(true);

    void (async () => {
      try {
        const listed = await fetchModels();
        if (controller.signal.aborted) return;
        const stored = getSessionSnapshot().selectedModel;
        const model =
          stored && listed.models.some((item) => item.id === stored)
            ? stored
            : (listed.models[0]?.id ?? null);
        if (!model) {
          throw new Error("Select a model first");
        }
        await streamChat({
          model,
          messages: [{ role: "user", content: text }],
          signal: controller.signal,
          onChunk: (chunk) => {
            if (!chunk.content) return;
            setReply((current) => current + chunk.content);
          },
        });
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : "Chat request failed",
        );
      } finally {
        if (!controller.signal.aborted) {
          setStreaming(false);
        }
      }
    })();

    return () => {
      controller.abort();
      setStreaming(false);
    };
  }, [input.recording, input.transcribing, input.transcript]);

  return { streaming, reply, error, prompt };
}
