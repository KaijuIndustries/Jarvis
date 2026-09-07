"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { OrbBloom } from "./OrbBloom";
import { OrbCore } from "./OrbCore";
import { tickEnergy } from "./energy";
import { OrbParticles } from "./OrbParticles";
import type { OrbAudioSource } from "./types";
import { OrbUniformsContext, useOrbUniforms, type OrbUniforms } from "./uniforms";

const VOID = "#05060a";

/**
 * Speed of every procedural motion. All continuous animation is driven
 * from store.time, so this scales core circulation, flow drift, idle
 * breathing and particle orbits together. Spring and attack/release
 * response stays on real time so reactions to state and audio keep
 * their weight instead of turning mushy.
 */
const TIME_SCALE = 0.24;

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
    store.time += delta * TIME_SCALE;
    tickEnergy(store, delta);
  });

  return null;
}

function OrbScaffold() {
  return (
    <group>
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
