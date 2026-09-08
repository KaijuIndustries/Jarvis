"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { JarvisOrb } from "@/components/orb";
import { useMicrophoneAnalyser } from "@/hooks/useMicrophoneAnalyser";
import { useMicrophoneSession } from "@/hooks/useMicrophoneSession";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";
import { fetchHealth } from "@/lib/client/api";
import { resolveOrbState } from "./resolveOrbState";

/**
 * Full-viewport Orb surface for /orb (future satellite screens).
 * Microphone analysis stays here and writes audioRef. The Orb only
 * visualises the values it is given.
 */
export function OrbMode() {
  const [healthOk, setHealthOk] = useState(true);
  const [checkingHealth, setCheckingHealth] = useState(true);
  const controlsReady = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const session = useMicrophoneSession();
  const mic = useMicrophoneAnalyser(session);
  const voice = useVoiceCapture(session);

  const state = resolveOrbState({
    streaming: false,
    healthOk,
    checkingHealth,
    recording: voice.recording,
    transcribing: voice.transcribing,
    voiceError: Boolean(session.error || voice.error),
  });

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const health = await fetchHealth();
      if (cancelled) return;
      setHealthOk(health.ok);
      setCheckingHealth(false);
    }

    void tick();
    const timer = window.setInterval(tick, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const statusText = session.error
    ? session.error
    : voice.error
      ? voice.error
      : voice.transcribing
        ? "Transcribing..."
        : voice.recording
          ? "Listening..."
          : voice.transcript === ""
            ? "I didn't hear anything."
            : voice.transcript;

  return (
    <div className="fixed inset-0 h-dvh w-dvw overflow-hidden bg-[#05060a]">
      <JarvisOrb
        state={state}
        audioRef={mic.audioRef}
        className="h-full w-full"
      />
      {controlsReady ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-2 text-center">
            {!session.enabled ? (
              <button
                type="button"
                onClick={() => void session.start()}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/10 hover:text-white"
              >
                Enable microphone
              </button>
            ) : (
              <button
                type="button"
                disabled={voice.transcribing}
                onClick={() => {
                  if (voice.recording) void voice.stop();
                  else void voice.start();
                }}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {voice.recording ? "Stop" : "Start speaking"}
              </button>
            )}
            {statusText ? (
              <p
                className={
                  session.error || voice.error
                    ? "text-[12px] text-[#c47c6e]"
                    : voice.transcript && !voice.recording && !voice.transcribing
                      ? "text-[12px] text-white/70"
                      : "text-[11px] tracking-wide text-white/35"
                }
              >
                {statusText}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
