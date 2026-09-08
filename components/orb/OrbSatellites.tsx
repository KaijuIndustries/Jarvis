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
import satelliteFrag from "./shaders/satellite.frag.glsl";
import satelliteVert from "./shaders/satellite.vert.glsl";
import { useOrbUniforms } from "./uniforms";

if (typeof satelliteVert !== "string" || typeof satelliteFrag !== "string") {
  throw new Error("Orb satellite shaders did not load as strings.");
}

const SLOTS = [
  { x: -0.32, y: -0.72, z: 0.04 },
  { x: 0, y: -0.8, z: 0 },
  { x: 0.32, y: -0.72, z: -0.04 },
] as const;

const REST = 0.0918;

function Satellite({ index }: { index: number }) {
  const store = useOrbUniforms();
  const meshRef = useRef<Mesh>(null);
  const matRef = useRef<ShaderMaterial>(null);
  const slot = SLOTS[index];

  const initialUniforms = useMemo(
    () => ({
      uThink: { value: 0 },
      uPulse: { value: 0 },
      uSlot: { value: index },
      uRadius: { value: REST },
      uPhase: { value: new Vector3() },
    }),
    [index],
  );

  useFrame(() => {
    const live = matRef.current?.uniforms;
    const mesh = meshRef.current;
    if (!live || !mesh) return;

    const src = store.current;
    const think =
      src.thinkTint > 0.01
        ? src.thinkTint
        : Math.round(src.state) === 2
          ? 1
          : 0;
    const walk = src.phaseMain * 3.0;
    const consider = Math.pow(
      0.5 + 0.5 * Math.sin(walk - index * ((Math.PI * 2) / 3)),
      2.6,
    );
    const breath = 0.5 + 0.5 * Math.sin(src.phaseMain + index * 1.7);
    const pulse = 0.42 + breath * 0.22 + consider * 0.48;

    live.uThink.value = think;
    live.uPulse.value = pulse;
    live.uPhase.value.x = src.phaseSlow;
    live.uPhase.value.y = src.phaseMain;
    live.uPhase.value.z = src.phaseQuick;

    const scale = REST * (0.8 + breath * 0.1 + consider * 0.22);
    const world = scale * (0.2 + think * 0.8);
    mesh.scale.setScalar(world);
    live.uRadius.value = world;
    mesh.position.set(
      slot.x + Math.cos(src.phaseSlow + index * 2.1) * 0.012 * think,
      slot.y + Math.sin(src.phaseMain + index * 1.4) * 0.014 * think,
      slot.z,
    );
    mesh.visible = think > 0.01;
  });

  return (
    <mesh ref={meshRef} renderOrder={1} frustumCulled={false} visible={false}>
      <icosahedronGeometry args={[1.32, 3]} />
      <shaderMaterial
        ref={matRef}
        uniforms={initialUniforms}
        vertexShader={satelliteVert}
        fragmentShader={satelliteFrag}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
        fog={false}
        side={DoubleSide}
      />
    </mesh>
  );
}

export function OrbSatellites() {
  return (
    <group>
      <Satellite index={0} />
      <Satellite index={1} />
      <Satellite index={2} />
    </group>
  );
}
