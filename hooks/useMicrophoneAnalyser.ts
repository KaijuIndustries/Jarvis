"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OrbAudioSource } from "@/components/orb";

const EMPTY: OrbAudioSource = {
  audioLevel: 0,
  bass: 0,
  mids: 0,
  treble: 0,
};

const FFT_SIZE = 2048;
const LISTEN_ON = 0.14;
const LISTEN_OFF = 0.055;
const SILENCE_MS = 380;
const ATTACK = 0.42;
const RELEASE = 0.14;

type Runtime = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  freq: Uint8Array<ArrayBuffer>;
  time: Uint8Array<ArrayBuffer>;
  raf: number;
  smooth: OrbAudioSource;
  voiced: boolean;
  silentSince: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function approach(current: number, target: number): number {
  const rate = target > current ? ATTACK : RELEASE;
  return current + (target - current) * rate;
}

function bandMean(
  bins: Uint8Array,
  sampleRate: number,
  lowHz: number,
  highHz: number,
): number {
  const binWidth = sampleRate / FFT_SIZE;
  const start = Math.max(0, Math.floor(lowHz / binWidth));
  const end = Math.min(bins.length - 1, Math.ceil(highHz / binWidth));
  if (end < start) return 0;
  let sum = 0;
  for (let i = start; i <= end; i += 1) sum += bins[i];
  return sum / (end - start + 1) / 255;
}

function rmsLevel(time: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < time.length; i += 1) {
    const sample = (time[i] - 128) / 128;
    sum += sample * sample;
  }
  return Math.sqrt(sum / time.length);
}

function describeMicError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Microphone permission was denied.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone is available.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The microphone is already in use or could not be opened.";
  }
  if (name === "SecurityError") {
    return "Microphone access is blocked in this context. Use localhost or HTTPS.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Microphone is unavailable.";
}

export function useMicrophoneAnalyser() {
  const audioRef = useRef<OrbAudioSource>({ ...EMPTY });
  const runtimeRef = useRef<Runtime | null>(null);
  const generationRef = useRef(0);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);

  const teardown = useCallback(() => {
    generationRef.current += 1;
    const runtime = runtimeRef.current;
    runtimeRef.current = null;
    audioRef.current.audioLevel = 0;
    audioRef.current.bass = 0;
    audioRef.current.mids = 0;
    audioRef.current.treble = 0;
    setEnabled(false);
    setVoiceActive(false);
    if (!runtime) return;

    cancelAnimationFrame(runtime.raf);
    try {
      runtime.source.disconnect();
    } catch {
      // Already disconnected.
    }
    try {
      runtime.analyser.disconnect();
    } catch {
      // Already disconnected.
    }
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
    const AudioCtx =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) {
      setError("Web Audio is not available in this browser.");
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch (cause) {
      setError(describeMicError(cause));
      return;
    }

    if (generationRef.current !== generation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const context = new AudioCtx();
    try {
      if (context.state === "suspended") await context.resume();
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      void context.close();
      setError("Could not start the audio context.");
      return;
    }

    if (generationRef.current !== generation) {
      stream.getTracks().forEach((track) => track.stop());
      void context.close();
      return;
    }

    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);

    const runtime: Runtime = {
      stream,
      context,
      source,
      analyser,
      freq: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
      time: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
      raf: 0,
      smooth: { ...EMPTY },
      voiced: false,
      silentSince: performance.now(),
    };
    runtimeRef.current = runtime;

    const tick = () => {
      const current = runtimeRef.current;
      if (!current || current !== runtime) return;

      current.analyser.getByteFrequencyData(current.freq);
      current.analyser.getByteTimeDomainData(current.time);

      const sampleRate = current.context.sampleRate;
      const next: OrbAudioSource = {
        audioLevel: clamp01(rmsLevel(current.time) * 3.4),
        bass: clamp01(bandMean(current.freq, sampleRate, 20, 250) * 2.6),
        mids: clamp01(bandMean(current.freq, sampleRate, 250, 2000) * 3.1),
        treble: clamp01(bandMean(current.freq, sampleRate, 2000, 10000) * 3.8),
      };

      current.smooth.audioLevel = approach(current.smooth.audioLevel, next.audioLevel);
      current.smooth.bass = approach(current.smooth.bass, next.bass);
      current.smooth.mids = approach(current.smooth.mids, next.mids);
      current.smooth.treble = approach(current.smooth.treble, next.treble);

      audioRef.current.audioLevel = current.smooth.audioLevel;
      audioRef.current.bass = current.smooth.bass;
      audioRef.current.mids = current.smooth.mids;
      audioRef.current.treble = current.smooth.treble;

      const level = current.smooth.audioLevel;
      const now = performance.now();
      if (!current.voiced && level >= LISTEN_ON) {
        current.voiced = true;
        setVoiceActive(true);
      } else if (current.voiced && level <= LISTEN_OFF) {
        if (now - current.silentSince >= SILENCE_MS) {
          current.voiced = false;
          setVoiceActive(false);
        }
      } else {
        current.silentSince = now;
      }

      current.raf = requestAnimationFrame(tick);
    };

    stream.getTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (runtimeRef.current === runtime) {
          teardown();
          setError("The microphone stopped unexpectedly.");
        }
      });
    });

    setEnabled(true);
    runtime.raf = requestAnimationFrame(tick);
  }, [teardown]);

  useEffect(() => teardown, [teardown]);

  return {
    audioRef,
    enabled,
    error,
    voiceActive,
    start,
    stop: teardown,
  };
}
