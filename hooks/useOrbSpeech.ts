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
import { ORB_POST_SPEECH_MS } from "@/lib/voice/orb-turn";
import { prepareSpeechText } from "@/lib/voice/speech-text";

type PlaybackNodes = {
  source: AudioBufferSourceNode;
  analyser: AnalyserNode;
  raf: number;
  ownedContext: AudioContext | null;
  context: AudioContext;
};

/**
 * Plays Piper WAV through the existing Orb AudioContext when possible,
 * and writes the same audioRef bands the microphone analyser uses.
 *
 * Ollama text is the producer; this hook is the FIFO speech consumer.
 * Sentences can be queued while a previous sentence is still synthesising
 * or playing. Only one Piper request and one playback run at a time.
 */
export function useOrbSpeech(input: {
  audioRef: MutableRefObject<OrbAudioSource>;
  context: AudioContext | null;
}) {
  const [speaking, setSpeaking] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const nodesRef = useRef<PlaybackNodes | null>(null);
  const queueRef = useRef<string[]>([]);
  const producerDoneRef = useRef(true);
  const reportErrorsRef = useRef(false);
  const waitRef = useRef<(() => void) | null>(null);
  const playbackFinishedRef = useRef(Promise.resolve());
  const audioRef = input.audioRef;
  const playbackContext = input.context;

  const stopSource = useCallback(() => {
    const nodes = nodesRef.current;
    if (!nodes) return;
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
  }, []);

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

  const kick = useCallback(() => {
    const wait = waitRef.current;
    waitRef.current = null;
    wait?.();
  }, []);

  const stop = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    queueRef.current = [];
    producerDoneRef.current = true;
    playbackFinishedRef.current = Promise.resolve();
    kick();
    detach();
    setSpeaking(false);
    setActive(false);
  }, [detach, kick]);

  const startPlayback = useCallback(
    (buffer: AudioBuffer, generation: number, owned: AudioContext | null, context: AudioContext) => {
      return new Promise<void>((resolve) => {
        if (generationRef.current !== generation) {
          if (owned && nodesRef.current?.ownedContext !== owned) void owned.close();
          resolve();
          return;
        }

        const existing = nodesRef.current;
        if (existing) stopSource();

        const analyser = existing?.analyser ?? context.createAnalyser();
        if (!existing) {
          analyser.fftSize = ORB_FFT_SIZE;
          analyser.smoothingTimeConstant = 0.72;
          analyser.connect(context.destination);
        }

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(analyser);

        const nodes: PlaybackNodes = {
          source,
          analyser,
          raf: existing?.raf ?? 0,
          ownedContext: existing?.ownedContext ?? owned,
          context,
        };
        nodesRef.current = nodes;

        if (!existing) {
          const freq = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
          const time = new Uint8Array(new ArrayBuffer(analyser.fftSize));
          const smooth = { ...EMPTY_ORB_AUDIO };
          const tick = () => {
            const current = nodesRef.current;
            if (!current || current.analyser !== analyser) return;
            const next = readOrbBands(current.analyser, context.sampleRate, freq, time);
            writeOrbAudio(audioRef.current, next, smooth);
            current.raf = requestAnimationFrame(tick);
          };
          nodes.raf = requestAnimationFrame(tick);
        }

        source.onended = () => {
          resolve();
        };
        setSpeaking(true);
        source.start();
      });
    },
    [audioRef, stopSource],
  );

  const playWav = useCallback(
    async (wav: Blob, generation: number) => {
      const existingContext = nodesRef.current?.context ?? playbackContext;
      const owned = existingContext ? null : createPlaybackContext();
      const context = existingContext ?? owned;
      if (!context) {
        throw new Error("Web Audio is not available in this browser.");
      }

      try {
        if (context.state === "suspended") {
          await context.resume();
        }
        if (generationRef.current !== generation) return;

        const buffer = await context.decodeAudioData(await wav.arrayBuffer());
        if (generationRef.current !== generation) return;

        await playbackFinishedRef.current;
        if (generationRef.current !== generation) return;

        playbackFinishedRef.current = startPlayback(buffer, generation, owned, context);
      } finally {
        if (owned && nodesRef.current?.ownedContext !== owned) {
          void owned.close();
        }
      }
    },
    [playbackContext, startPlayback],
  );

  const waitForWork = useCallback((generation: number) => {
    if (generationRef.current !== generation) return Promise.resolve();
    if (queueRef.current.length > 0 || producerDoneRef.current) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      waitRef.current = resolve;
      if (queueRef.current.length > 0 || producerDoneRef.current) {
        waitRef.current = null;
        resolve();
      }
    });
  }, []);

  const runConsumer = useCallback(
    async (generation: number) => {
      while (generationRef.current === generation) {
        const sentence = queueRef.current.shift();
        if (sentence !== undefined) {
          try {
            const abort = abortRef.current;
            const wav = await synthesizeSpeech(sentence, abort?.signal);
            if (generationRef.current !== generation) return;
            await playWav(wav, generation);
          } catch (cause) {
            if (generationRef.current !== generation) return;
            if (cause instanceof DOMException && cause.name === "AbortError") return;
            if (cause instanceof Error && cause.message === "The request was cancelled.") {
              return;
            }
            console.error("Orb speech skipped a sentence:", cause);
            if (reportErrorsRef.current) {
              setError(
                cause instanceof Error && cause.message
                  ? cause.message
                  : "Speech synthesis failed.",
              );
            }
          }
          continue;
        }
        if (producerDoneRef.current) break;
        await waitForWork(generation);
      }

      if (generationRef.current !== generation) return;
      await playbackFinishedRef.current;
      if (generationRef.current !== generation) return;
      detach();
      setSpeaking(false);
      if (ORB_POST_SPEECH_MS > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, ORB_POST_SPEECH_MS));
      }
      if (generationRef.current !== generation) return;
      setActive(false);
    },
    [detach, playWav, waitForWork],
  );

  const startSpeechQueue = useCallback(
    (options?: { reportErrors?: boolean }) => {
      generationRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      queueRef.current = [];
      producerDoneRef.current = false;
      reportErrorsRef.current = Boolean(options?.reportErrors);
      playbackFinishedRef.current = Promise.resolve();
      kick();
      detach();
      setError(null);
      setSpeaking(false);
      setActive(true);
      void runConsumer(generationRef.current);
    },
    [detach, kick, runConsumer],
  );

  const queueSentence = useCallback(
    (text: string) => {
      const trimmed = prepareSpeechText(text);
      if (!trimmed) return;
      queueRef.current.push(trimmed);
      setSpeaking(true);
      setActive(true);
      kick();
    },
    [kick],
  );

  const finishSpeechQueue = useCallback(() => {
    producerDoneRef.current = true;
    kick();
  }, [kick]);

  const speak = useCallback(
    async (text: string) => {
      const trimmed = text.replace(/\s+/g, " ").trim();
      if (!trimmed) return;
      startSpeechQueue({ reportErrors: true });
      queueSentence(trimmed);
      finishSpeechQueue();
    },
    [finishSpeechQueue, queueSentence, startSpeechQueue],
  );

  useEffect(() => stop, [stop]);

  return {
    speaking,
    active,
    error,
    speak,
    stop,
    startSpeechQueue,
    queueSentence,
    finishSpeechQueue,
  };
}

function createPlaybackContext(): AudioContext | null {
  const AudioCtx = getAudioContextConstructor();
  return AudioCtx ? new AudioCtx() : null;
}
