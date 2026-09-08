"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  DoubleSide,
  Vector3,
  type Mesh,
  type ShaderMaterial,
} from "three";
import haloFrag from "./shaders/halo.frag.glsl";
import haloVert from "./shaders/halo.vert.glsl";
import { useOrbUniforms } from "./uniforms";

if (typeof haloVert !== "string" || typeof haloFrag !== "string") {
  throw new Error("Orb halo shaders did not load as strings.");
}

export function OrbHalo() {
  const store = useOrbUniforms();
  const meshRef = useRef<Mesh>(null);
  const matRef = useRef<ShaderMaterial>(null);

  const initialUniforms = useMemo(
    () => ({
      uListen: { value: 0 },
      uSpeak: { value: 0 },
      uPhase: { value: new Vector3() },
      uLevel: { value: 0 },
      uBass: { value: 0 },
      uMids: { value: 0 },
      uTreble: { value: 0 },
    }),
    [],
  );

  useFrame(({ camera }) => {
    meshRef.current?.lookAt(camera.position);
    const live = matRef.current?.uniforms;
    if (!live) return;
    const src = store.current;
    live.uListen.value = src.listenTint;
    live.uSpeak.value = src.speakTint;
    live.uPhase.value.x = src.phaseSlow;
    live.uPhase.value.y = src.phaseMain;
    live.uPhase.value.z = src.phaseQuick;
    live.uLevel.value = src.audioLevel;
    live.uBass.value = src.bass;
    live.uMids.value = src.mids;
    live.uTreble.value = src.treble;
  });

  return (
    <mesh ref={meshRef} renderOrder={2} frustumCulled={false}>
      <planeGeometry args={[2.4, 2.4]} />
      <shaderMaterial
        ref={matRef}
        uniforms={initialUniforms}
        vertexShader={haloVert}
        fragmentShader={haloFrag}
        transparent
        depthWrite={false}
        side={DoubleSide}
        blending={AdditiveBlending}
        toneMapped={false}
        fog={false}
      />
    </mesh>
  );
}
