"use client";

import { Bloom, EffectComposer } from "@react-three/postprocessing";

/** Tight bloom: high threshold so only the hot core bleeds. */
export function OrbBloom() {
  return (
    <EffectComposer enableNormalPass={false} multisampling={0}>
      <Bloom
        intensity={0.18}
        luminanceThreshold={0.58}
        luminanceSmoothing={0.24}
        mipmapBlur
        radius={0.34}
      />
    </EffectComposer>
  );
}
