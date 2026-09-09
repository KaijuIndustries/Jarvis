"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeUtterance } from "@/lib/client/api";
import { resampleFloat32 } from "@/lib/client/microphone";
import { ensurePcmWorklet, PCM_WORKLET_NAME } from "@/lib/client/pcm-worklet";
import {
  float32ToInt16,
  int16ToBytes,
  isSilentUtterance,
  MAX_UTTERANCE_SECONDS,
  PCM_CHANNELS,
  PCM_RATE,
  PCM_WIDTH,
} from "@/lib/voice/pcm";
import type { MicrophoneSession } from "./useMicrophoneSession";

function concatFloat32(chunks: Float32Array[]): Float32Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function pcmBody(samples: Int16Array): ArrayBuffer {
  const bytes = int16ToBytes(samples);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

type CaptureNodes = {
  source: MediaStreamAudioSourceNode;
  node: AudioWorkletNode;
  mute: GainNode;
};

export function useVoiceCapture(session: MicrophoneSession) {
  const chunksRef = useRef<Float32Array[]>([]);
  const nodesRef = useRef<CaptureNodes | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stopTimerRef = useRef<number>(0);
  const generationRef = useRef(0);
  const recordingRef = useRef(false);
  const sampleRateRef = useRef(48_000);
  const stopRef = useRef<() => Promise<void>>(async () => undefined);

  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detachCapture = useCallback(() => {
    if (stopTimerRef.current) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = 0;
    }
    const nodes = nodesRef.current;
    nodesRef.current = null;
    if (!nodes) return;
    try {
      nodes.node.port.onmessage = null;
      nodes.node.port.close();
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

  const cancel = useCallback(() => {
    generationRef.current += 1;
    recordingRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    detachCapture();
    chunksRef.current = [];
    setRecording(false);
    setTranscribing(false);
  }, [detachCapture]);

  const stop = useCallback(async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const nativeRate = sampleRateRef.current;
    const nodes = nodesRef.current;

    if (nodes) {
      try {
        await new Promise<void>((resolve) => {
          const timeout = window.setTimeout(resolve, 150);
          const previous = nodes.node.port.onmessage;
          nodes.node.port.onmessage = (
            event: MessageEvent<Float32Array | { type: string }>,
          ) => {
            if (event.data instanceof Float32Array) {
              chunksRef.current.push(event.data);
            } else if (event.data && event.data.type === "flushed") {
              window.clearTimeout(timeout);
              resolve();
            }
            previous?.call(nodes.node.port, event);
          };
          nodes.node.port.postMessage("flush");
        });
      } catch {
        // Use whatever samples were already buffered.
      }
    }

    detachCapture();

    const samples = concatFloat32(chunksRef.current);
    chunksRef.current = [];
    if (generationRef.current !== generation) return;

    if (samples.length === 0) {
      setTranscript("");
      return;
    }

    setTranscribing(true);
    try {
      let resampled: Float32Array;
      try {
        resampled = await resampleFloat32(samples, nativeRate, PCM_RATE);
      } catch {
        setError("Could not prepare the recording.");
        return;
      }

      if (generationRef.current !== generation) return;

      const pcm = float32ToInt16(resampled);
      if (isSilentUtterance(pcm, PCM_RATE)) {
        setTranscript("");
        return;
      }

      const abort = new AbortController();
      abortRef.current = abort;
      const result = await transcribeUtterance(
        pcmBody(pcm),
        { rate: PCM_RATE, width: PCM_WIDTH, channels: PCM_CHANNELS },
        abort.signal,
      );
      if (generationRef.current !== generation) return;
      setTranscript(result.text);
    } catch (cause) {
      if (generationRef.current !== generation) return;
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      const message =
        cause instanceof Error && cause.message
          ? cause.message
          : "Speech recognition failed.";
      setError(message);
    } finally {
      if (abortRef.current) abortRef.current = null;
      if (generationRef.current === generation) {
        setTranscribing(false);
      }
    }
  }, [detachCapture]);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const start = useCallback(async () => {
    if (recordingRef.current) return;
    if (!session.stream || !session.context) {
      setError("Enable the microphone first.");
      return;
    }

    setError(null);
    setTranscript(null);
    chunksRef.current = [];

    try {
      await ensurePcmWorklet(session.context);
    } catch {
      setError("This browser cannot capture raw microphone audio.");
      return;
    }

    if (!session.stream || !session.context) {
      setError("The microphone is no longer available.");
      return;
    }

    try {
      const source = session.context.createMediaStreamSource(session.stream);
      const node = new AudioWorkletNode(session.context, PCM_WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
      });
      const mute = session.context.createGain();
      mute.gain.value = 0;
      node.port.onmessage = (event: MessageEvent<Float32Array | { type: string }>) => {
        if (event.data instanceof Float32Array) {
          chunksRef.current.push(event.data);
        }
      };
      node.onprocessorerror = () => {
        setError("Audio capture failed.");
        cancel();
      };
      source.connect(node);
      node.connect(mute);
      mute.connect(session.context.destination);
      nodesRef.current = { source, node, mute };
      sampleRateRef.current = session.context.sampleRate;
    } catch {
      detachCapture();
      setError("Could not start speech capture.");
      return;
    }

    recordingRef.current = true;
    setRecording(true);
    stopTimerRef.current = window.setTimeout(() => {
      void stopRef.current();
    }, MAX_UTTERANCE_SECONDS * 1000);
  }, [cancel, detachCapture, session.context, session.stream]);

  useEffect(() => {
    if (session.enabled) return;
    if (!recordingRef.current && !abortRef.current) return;
    const timer = window.setTimeout(() => cancel(), 0);
    return () => window.clearTimeout(timer);
  }, [cancel, session.enabled]);

  useEffect(() => cancel, [cancel]);

  return {
    recording,
    transcribing,
    transcript,
    error,
    start,
    stop,
    cancel,
  };
}
