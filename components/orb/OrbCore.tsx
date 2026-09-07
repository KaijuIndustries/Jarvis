"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, type ShaderMaterial } from "three";
import coreFrag from "./shaders/core.frag.glsl";
import coreVert from "./shaders/core.vert.glsl";
import { useOrbUniforms, writeLayerUniforms } from "./uniforms";

const CORE_RADIUS = 0.48;

/**
 * How far uRadius may swell above CORE_RADIUS at full drive. This is the
 * uniform part of the growth; the shader adds a directional swell on top,
 * so this stays modest to keep the two from compounding into a zoom.
 */
const MAX_SWELL = 0.35;
/** Sprung size channel range, including spring overshoot. */
const MAX_SIZE = 1.2;
const MIN_SIZE = -0.4;

/** Must match MARCH_PAD in core.frag.glsl. */
const MARCH_PAD = 1.32;

/**
 * The mesh is only a proxy for the raymarch: the fragment shader
 * discards any ray that misses the padded march sphere, so nothing
 * outside it is ever drawn. It has to stay comfortably larger than the
 * biggest march sphere or an expanding Orb gets clipped to the
 * silhouette, even after the vertex stage nudges the surface inward.
 */
const BOUND_RADIUS =
  CORE_RADIUS * (1 + MAX_SWELL * MAX_SIZE) * MARCH_PAD * 1.14;

if (typeof coreVert !== "string" || typeof coreFrag !== "string") {
  throw new Error("Orb core shaders did not load as strings.");
}

export function OrbCore() {
  const store = useOrbUniforms();
  const matRef = useRef<ShaderMaterial>(null);

  // Initial values only. The live values live on the material.
  const initialUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uState: { value: 0 },
      uIntensity: { value: 1 },
      uDistortion: { value: 0.35 },
      uRadius: { value: CORE_RADIUS },
      uJitter: { value: 0 },
      uEnergy: { value: 0 },
      uCoreDrive: { value: 0 },
      uTurbulence: { value: 0 },
      uSpark: { value: 0 },
      uFlow: { value: 1 },
      uSize: { value: 0 },
    }),
    [],
  );

  useFrame(() => {
    // Write into the material's own uniforms, never the object passed as
    // a prop. ShaderMaterial clones the uniforms it is constructed with,
    // so mutating the prop object updates a detached copy and the shader
    // renders a frozen frame.
    const live = matRef.current?.uniforms;
    if (!live) return;

    const src = store.current;
    writeLayerUniforms(live, src);

    // The sprung size channel. Because the core is raymarched it ignores
    // mesh scale entirely — expansion has to happen through uRadius.
    const swell = Math.min(Math.max(src.breathe, MIN_SIZE), MAX_SIZE);
    live.uSize.value = swell;
    live.uRadius.value = CORE_RADIUS * (1 + swell * MAX_SWELL);
  });

  return (
    <mesh renderOrder={3}>
      <icosahedronGeometry args={[BOUND_RADIUS, 5]} />
      <shaderMaterial
        ref={matRef}
        uniforms={initialUniforms}
        vertexShader={coreVert}
        fragmentShader={coreFrag}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
        fog={false}
      />
    </mesh>
  );
}
