"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { OrbAudioSource } from "@/components/orb";
import { synthesizeSpeech } from "@/lib/client/api";
import {
  EMPTY_ORB_AUDIO,
  ORB_FFT_SIZE,
  readOrbBands,
  resetOrbAudio,
  writeOrbAudio,
} from "@/lib/client/audio-bands";
import { getAudioContextConstructor } from "@/lib/client/microphone";

type PlaybackNodes = {
  source: AudioBufferSourceNode;
  analyser: AnalyserNode;
  raf: number;
  ownedContext: AudioContext | null;
};

/**
 * Plays Piper WAV through the existing Orb AudioContext when possible,
 * and writes the same audioRef bands the microphone analyser uses.
 */
export function useOrbSpeech(input: {
  audioRef: MutableRefObject<OrbAudioSource>;
  context: AudioContext | null;
}) {
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const nodesRef = useRef<PlaybackNodes | null>(null);
  const audioRef = input.audioRef;
  const playbackContext = input.context;

  const detach = useCallback(() => {
    const nodes = nodesRef.current;
    nodesRef.current = null;
    if (!nodes) return;
    cancelAnimationFrame(nodes.raf);
    try {
      nodes.source.onended = null;
      nodes.source.stop();
    } catch {
      // Already stopped.
    }
    try {
      nodes.source.disconnect();
    } catch {
      // Already disconnected.
    }
    try {
      nodes.analyser.disconnect();
    } catch {
      // Already disconnected.
    }
    if (nodes.ownedContext) {
      void nodes.ownedContext.close();
    }
    resetOrbAudio(audioRef.current);
  }, [audioRef]);

  const stop = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    detach();
    setSpeaking(false);
  }, [detach]);

  const speak = useCallback(
    async (text: string) => {
      const trimmed = text.replace(/\s+/g, " ").trim();
      if (!trimmed) return;

      const generation = generationRef.current + 1;
      generationRef.current = generation;
      abortRef.current?.abort();
      detach();
      setError(null);

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const wav = await synthesizeSpeech(trimmed, abort.signal);
        if (generationRef.current !== generation) return;

        const existing = playbackContext;
        const owned = existing ? null : createPlaybackContext();
        const context = existing ?? owned;
        if (!context) {
          throw new Error("Web Audio is not available in this browser.");
        }
        if (context.state === "suspended") {
          await context.resume();
        }
        if (generationRef.current !== generation) {
          if (owned) void owned.close();
          return;
        }

        const buffer = await context.decodeAudioData(await wav.arrayBuffer());
        if (generationRef.current !== generation) {
          if (owned) void owned.close();
          return;
        }

        const source = context.createBufferSource();
        const analyser = context.createAnalyser();
        analyser.fftSize = ORB_FFT_SIZE;
        analyser.smoothingTimeConstant = 0.72;
        source.buffer = buffer;
        source.connect(analyser);
        analyser.connect(context.destination);

        const freq = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        const time = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        const smooth = { ...EMPTY_ORB_AUDIO };
        const nodes: PlaybackNodes = {
          source,
          analyser,
          raf: 0,
          ownedContext: owned,
        };
        nodesRef.current = nodes;

        const tick = () => {
          if (nodesRef.current !== nodes) return;
          const next = readOrbBands(analyser, context.sampleRate, freq, time);
          writeOrbAudio(audioRef.current, next, smooth);
          nodes.raf = requestAnimationFrame(tick);
        };
        nodes.raf = requestAnimationFrame(tick);

        source.onended = () => {
          if (generationRef.current !== generation) return;
          detach();
          setSpeaking(false);
        };

        setSpeaking(true);
        source.start();
      } catch (cause) {
        if (generationRef.current !== generation) return;
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        detach();
        setSpeaking(false);
        setError(
          cause instanceof Error && cause.message
            ? cause.message
            : "Speech synthesis failed.",
        );
      } finally {
        if (abortRef.current === abort) abortRef.current = null;
      }
    },
    [audioRef, detach, playbackContext],
  );

  useEffect(() => stop, [stop]);

  return { speaking, error, speak, stop };
}

function createPlaybackContext(): AudioContext | null {
  const AudioCtx = getAudioContextConstructor();
  return AudioCtx ? new AudioCtx() : null;
}
