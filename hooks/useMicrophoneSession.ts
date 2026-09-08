"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  describeMicError,
  getAudioContextConstructor,
} from "@/lib/client/microphone";

type Runtime = {
  stream: MediaStream;
  context: AudioContext;
};

export type MicrophoneSession = {
  enabled: boolean;
  error: string | null;
  stream: MediaStream | null;
  context: AudioContext | null;
  start: () => Promise<void>;
  stop: () => void;
};

export function useMicrophoneSession(): MicrophoneSession {
  const runtimeRef = useRef<Runtime | null>(null);
  const generationRef = useRef(0);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [context, setContext] = useState<AudioContext | null>(null);

  const stop = useCallback(() => {
    generationRef.current += 1;
    const runtime = runtimeRef.current;
    runtimeRef.current = null;
    setEnabled(false);
    setStream(null);
    setContext(null);
    if (!runtime) return;
    runtime.stream.getTracks().forEach((track) => track.stop());
    void runtime.context.close();
  }, []);

  const start = useCallback(async () => {
    if (runtimeRef.current) return;
    setError(null);

    if (typeof window === "undefined") {
      setError("Microphone is only available in the browser.");
      return;
    }
    if (!window.isSecureContext) {
      setError("Microphone access needs localhost or HTTPS.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support microphone capture.");
      return;
    }
    const AudioCtx = getAudioContextConstructor();
    if (!AudioCtx) {
      setError("Web Audio is not available in this browser.");
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;

    let nextStream: MediaStream;
    try {
      nextStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
    } catch (cause) {
      setError(describeMicError(cause));
      return;
    }

    if (generationRef.current !== generation) {
      nextStream.getTracks().forEach((track) => track.stop());
      return;
    }

    const nextContext = new AudioCtx();
    try {
      if (nextContext.state === "suspended") await nextContext.resume();
    } catch {
      nextStream.getTracks().forEach((track) => track.stop());
      void nextContext.close();
      setError("Could not start the audio context.");
      return;
    }

    if (generationRef.current !== generation) {
      nextStream.getTracks().forEach((track) => track.stop());
      void nextContext.close();
      return;
    }

    const runtime: Runtime = { stream: nextStream, context: nextContext };
    runtimeRef.current = runtime;

    nextStream.getTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (runtimeRef.current === runtime) {
          stop();
          setError("The microphone stopped unexpectedly.");
        }
      });
    });

    setStream(nextStream);
    setContext(nextContext);
    setEnabled(true);
  }, [stop]);

  useEffect(() => stop, [stop]);

  return {
    enabled,
    error,
    stream,
    context,
    start,
    stop,
  };
}
