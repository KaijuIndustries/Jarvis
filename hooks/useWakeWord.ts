"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWakeHealth, sendWakeAudio } from "@/lib/client/api";
import { ensurePcmWorklet, PCM_WORKLET_NAME } from "@/lib/client/pcm-worklet";
import {
  float32ToInt16,
  int16ToBytes,
  PCM_RATE,
  resampleInt16Mono,
} from "@/lib/voice/pcm";
import { WAKE_PHRASE } from "@/lib/voice/wakeword";
import type { MicrophoneSession } from "./useMicrophoneSession";

type CaptureNodes = {
  source: MediaStreamAudioSourceNode;
  node: AudioWorkletNode;
  mute: GainNode;
};

export type WakeWordStatus = "off" | "armed" | "unavailable";

function copyPcm(samples: Int16Array): ArrayBuffer {
  const bytes = int16ToBytes(samples);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function concatInt16(chunks: Int16Array[]): Int16Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Int16Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Streams Orb microphone PCM to Jarvis for Hey Friday detection.
 * Detection is a silent trigger; it does not own Orb visual state.
 */
export function useWakeWord(input: {
  session: MicrophoneSession;
  enabled: boolean;
  onWake: () => void;
}) {
  const nodesRef = useRef<CaptureNodes | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const pendingRef = useRef<Int16Array[]>([]);
  const sampleRateRef = useRef(48_000);
  const sessionIdRef = useRef("");
  const generationRef = useRef(0);
  const pumpRef = useRef<() => void>(() => undefined);
  const onWakeRef = useRef(input.onWake);

  const [streamStatus, setStreamStatus] = useState<"armed" | "unavailable">("armed");
  const [error, setError] = useState<string | null>(null);

  const live = Boolean(
    input.enabled && input.session.enabled && input.session.stream && input.session.context,
  );
  const status: WakeWordStatus = live ? streamStatus : "off";

  useEffect(() => {
    onWakeRef.current = input.onWake;
  }, [input.onWake]);

  const detach = useCallback(() => {
    const nodes = nodesRef.current;
    nodesRef.current = null;
    if (!nodes) return;
    try {
      nodes.node.port.onmessage = null;
    } catch {
      // Already closed.
    }
    for (const node of [nodes.source, nodes.node, nodes.mute]) {
      try {
        node.disconnect();
      } catch {
        // Already disconnected.
      }
    }
  }, []);

  const disarm = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    pendingRef.current = [];
    sessionIdRef.current = "";
    detach();
  }, [detach]);

  useEffect(() => {
    pumpRef.current = () => {
      void (async () => {
        if (sendingRef.current) return;
        const sessionId = sessionIdRef.current;
        const abort = abortRef.current;
        if (!sessionId || !abort) return;

        sendingRef.current = true;
        try {
          while (pendingRef.current.length > 0 && abortRef.current === abort) {
            const batch = concatInt16(pendingRef.current);
            pendingRef.current = [];
            if (batch.length === 0) continue;
            const result = await sendWakeAudio(sessionId, copyPcm(batch), abort.signal);
            if (abortRef.current !== abort) return;
            if (result.type === "wake" && result.phrase === WAKE_PHRASE) {
              console.log("Wake word detected:", result);
              onWakeRef.current();
            } else if (result.type === "error") {
              setStreamStatus("unavailable");
              setError(result.error);
            } else {
              setStreamStatus((current) => (current === "unavailable" ? "armed" : current));
              setError(null);
            }
          }
        } catch (cause) {
          if (abortRef.current !== abort) return;
          if (cause instanceof Error && cause.message === "The request was cancelled.") return;
          setStreamStatus("unavailable");
          setError(
            cause instanceof Error && cause.message
              ? cause.message
              : "Wake-word service is unavailable.",
          );
        } finally {
          sendingRef.current = false;
          if (pendingRef.current.length > 0 && abortRef.current === abort) {
            pumpRef.current();
          }
        }
      })();
    };
  }, []);

  useEffect(() => {
    if (!live || !input.session.stream || !input.session.context) {
      abortRef.current?.abort();
      abortRef.current = null;
      pendingRef.current = [];
      sessionIdRef.current = "";
      detach();
      return;
    }

    let cancelled = false;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const context = input.session.context;
    const stream = input.session.stream;
    const abort = new AbortController();
    abortRef.current = abort;
    sessionIdRef.current = crypto.randomUUID();
    pendingRef.current = [];
    sampleRateRef.current = context.sampleRate;

    void (async () => {
      let healthy = false;
      while (!cancelled && generationRef.current === generation) {
        const health = await fetchWakeHealth();
        if (cancelled || generationRef.current !== generation) return;
        if (health.ok) {
          healthy = true;
          setError(null);
          break;
        }
        setStreamStatus("unavailable");
        setError(health.error ?? "Wake-word service is unavailable.");
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
      }
      if (!healthy || cancelled || generationRef.current !== generation) return;

      try {
        await ensurePcmWorklet(context);
      } catch {
        if (!cancelled && generationRef.current === generation) {
          setStreamStatus("unavailable");
          setError("This browser cannot capture raw microphone audio.");
        }
        return;
      }
      if (cancelled || generationRef.current !== generation || abortRef.current !== abort) return;

      try {
        const source = context.createMediaStreamSource(stream);
        const node = new AudioWorkletNode(context, PCM_WORKLET_NAME, {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 1,
        });
        const mute = context.createGain();
        mute.gain.value = 0;
        node.port.onmessage = (event: MessageEvent<Float32Array | { type: string }>) => {
          if (!(event.data instanceof Float32Array)) return;
          try {
            const pcm = resampleInt16Mono(
              float32ToInt16(event.data),
              sampleRateRef.current,
              PCM_RATE,
            );
            if (pcm.length === 0) return;
            pendingRef.current.push(pcm);
            pumpRef.current();
          } catch {
            // Drop a bad frame rather than tearing down capture.
          }
        };
        node.onprocessorerror = () => {
          setStreamStatus("unavailable");
          setError("Audio capture failed.");
        };
        source.connect(node);
        node.connect(mute);
        mute.connect(context.destination);
        nodesRef.current = { source, node, mute };
        setStreamStatus("armed");
      } catch {
        if (!cancelled && generationRef.current === generation) {
          detach();
          setStreamStatus("unavailable");
          setError("Could not start wake-word capture.");
        }
      }
    })();

    return () => {
      cancelled = true;
      abort.abort();
      if (abortRef.current === abort) abortRef.current = null;
      pendingRef.current = [];
      detach();
    };
  }, [detach, input.session.context, input.session.stream, live]);

  return { status, error, disarm };
}
