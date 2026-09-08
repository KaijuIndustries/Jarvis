"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { OrbBloom } from "./OrbBloom";
import { OrbCore } from "./OrbCore";
import { advanceLoop, tickEnergy } from "./energy";
import { OrbHalo } from "./OrbHalo";
import { OrbParticles } from "./OrbParticles";
import { OrbSatellites } from "./OrbSatellites";
import type { OrbAudioSource } from "./types";
import { OrbUniformsContext, useOrbUniforms, type OrbUniforms } from "./uniforms";

const VOID = "#05060a";

type OrbSceneProps = {
  uniforms: MutableRefObject<OrbUniforms>;
  audioRef?: MutableRefObject<OrbAudioSource>;
};

function ClockDriver({
  audioRef,
}: {
  audioRef?: MutableRefObject<OrbAudioSource>;
}) {
  const uniforms = useOrbUniforms();

  useFrame((_, delta) => {
    const store = uniforms.current;
    const live = audioRef?.current;
    if (live) {
      store.rawLevel = live.audioLevel;
      store.rawBass = live.bass;
      store.rawMids = live.mids;
      store.rawTreble = live.treble;
    }
    if (store.paused > 0.5) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const step = Math.min(Math.max(delta, 0), 0.05);
    advanceLoop(store, step);
    tickEnergy(store, step);
  });

  return null;
}

function OrbScaffold() {
  return (
    <group>
      <OrbHalo />
      <OrbSatellites />
      <OrbCore />
      <OrbParticles />
    </group>
  );
}

export function OrbScene({ uniforms, audioRef }: OrbSceneProps) {
  return (
    <OrbUniformsContext.Provider value={uniforms}>
      <Canvas
        dpr={[1, 1.75]}
        resize={{ scroll: false, debounce: 0 }}
        style={{ width: "100%", height: "100%", display: "block" }}
        gl={{
          antialias: false,
          alpha: true,
          powerPreference: "high-performance",
        }}
        camera={{ position: [0, 0.12, 4.35], fov: 32, near: 0.1, far: 24 }}
      >
        <color attach="background" args={[VOID]} />
        <fog attach="fog" args={[VOID, 5.2, 11]} />
        <ClockDriver audioRef={audioRef} />
        <OrbScaffold />
        <OrbBloom />
      </Canvas>
    </OrbUniformsContext.Provider>
  );
}
