"use client";

import { useEffect, useState } from "react";
import { JarvisOrb } from "@/components/orb";
import { useMicrophoneAnalyser } from "@/hooks/useMicrophoneAnalyser";
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
  const [controlsReady, setControlsReady] = useState(false);
  const mic = useMicrophoneAnalyser();

  const baseState = resolveOrbState({
    streaming: false,
    healthOk,
    checkingHealth,
  });
  const state =
    baseState === "error"
      ? "error"
      : mic.enabled && mic.voiceActive
        ? "listening"
        : "idle";

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const health = await fetchHealth();
      if (cancelled) return;
      setHealthOk(health.ok);
      setCheckingHealth(false);
    }

    setControlsReady(true);
    void tick();
    const timer = window.setInterval(tick, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="fixed inset-0 h-dvh w-dvw overflow-hidden bg-[#05060a]">
      <JarvisOrb
        state={state}
        audioRef={mic.audioRef}
        className="h-full w-full"
      />
      {controlsReady ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center px-4">
          <div className="pointer-events-auto max-w-sm text-center">
            {mic.error ? (
              <p className="text-[12px] text-[#c47c6e]">{mic.error}</p>
            ) : mic.enabled ? (
              <p className="text-[11px] tracking-wide text-white/35">
                Microphone on
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void mic.start()}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/10 hover:text-white"
              >
                Enable microphone
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
