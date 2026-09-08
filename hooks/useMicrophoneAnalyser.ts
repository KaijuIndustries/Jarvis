"use client";

import { useEffect, useRef, useState } from "react";
import type { OrbAudioSource } from "@/components/orb";
import type { MicrophoneSession } from "./useMicrophoneSession";

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

function resetAudio(audioRef: { current: OrbAudioSource }) {
  audioRef.current.audioLevel = 0;
  audioRef.current.bass = 0;
  audioRef.current.mids = 0;
  audioRef.current.treble = 0;
}

export function useMicrophoneAnalyser(session: MicrophoneSession) {
  const audioRef = useRef<OrbAudioSource>({ ...EMPTY });
  const runtimeRef = useRef<Runtime | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);

  useEffect(() => {
    const stream = session.stream;
    const context = session.context;
    if (!stream || !context) {
      return;
    }

    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);

    const runtime: Runtime = {
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

      const sampleRate = context.sampleRate;
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

    runtime.raf = requestAnimationFrame(tick);

    return () => {
      if (runtimeRef.current === runtime) {
        runtimeRef.current = null;
      }
      cancelAnimationFrame(runtime.raf);
      resetAudio(audioRef);
      setVoiceActive(false);
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
    };
  }, [session.context, session.stream]);

  return {
    audioRef,
    voiceActive,
  };
}
