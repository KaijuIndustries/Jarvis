"use client";

import { useEffect, useRef, useState } from "react";
import type { OrbAudioSource } from "@/components/orb";
import {
  EMPTY_ORB_AUDIO,
  ORB_FFT_SIZE,
  readOrbBands,
  resetOrbAudio,
  writeOrbAudio,
} from "@/lib/client/audio-bands";
import type { MicrophoneSession } from "./useMicrophoneSession";

const LISTEN_ON = 0.14;
const LISTEN_OFF = 0.055;
const SILENCE_MS = 380;

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

export function useMicrophoneAnalyser(
  session: MicrophoneSession,
  options?: {
    audioRef?: { current: OrbAudioSource };
    suppressWrites?: boolean;
  },
) {
  const localAudioRef = useRef<OrbAudioSource>({ ...EMPTY_ORB_AUDIO });
  const audioRef = options?.audioRef ?? localAudioRef;
  const runtimeRef = useRef<Runtime | null>(null);
  const suppressRef = useRef(false);

  useEffect(() => {
    suppressRef.current = Boolean(options?.suppressWrites);
  }, [options?.suppressWrites]);
  const [voiceActive, setVoiceActive] = useState(false);

  useEffect(() => {
    const stream = session.stream;
    const context = session.context;
    if (!stream || !context) {
      return;
    }

    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = ORB_FFT_SIZE;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);

    const runtime: Runtime = {
      source,
      analyser,
      freq: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
      time: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
      raf: 0,
      smooth: { ...EMPTY_ORB_AUDIO },
      voiced: false,
      silentSince: performance.now(),
    };
    runtimeRef.current = runtime;

    const tick = () => {
      const current = runtimeRef.current;
      if (!current || current !== runtime) return;

      const next = readOrbBands(
        current.analyser,
        context.sampleRate,
        current.freq,
        current.time,
      );
      writeOrbAudio(current.smooth, next, current.smooth);

      if (!suppressRef.current) {
        audioRef.current.audioLevel = current.smooth.audioLevel;
        audioRef.current.bass = current.smooth.bass;
        audioRef.current.mids = current.smooth.mids;
        audioRef.current.treble = current.smooth.treble;
      }

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
    const audio = audioRef.current;

    return () => {
      if (runtimeRef.current === runtime) {
        runtimeRef.current = null;
      }
      cancelAnimationFrame(runtime.raf);
      resetOrbAudio(audio);
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
  }, [audioRef, session.context, session.stream]);

  return {
    audioRef,
    voiceActive,
  };
}
