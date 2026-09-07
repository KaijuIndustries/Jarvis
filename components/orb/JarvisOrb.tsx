"use client";

import dynamic from "next/dynamic";
import { useRef } from "react";
import type { JarvisOrbProps } from "./types";
import { createOrbUniforms, syncOrbUniforms } from "./uniforms";

const OrbScene = dynamic(
  () => import("./OrbScene").then((module) => module.OrbScene),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-[#05060a]" />,
  },
);

/** Frozen visual constants. Not exposed on the public API. */
const INTENSITY = 1;
const DISTORTION = 0.35;

export function JarvisOrb({
  state = "idle",
  audioLevel = 0,
  bass = 0,
  mids = 0,
  treble = 0,
  paused = false,
  audioRef,
  className,
}: JarvisOrbProps) {
  const uniforms = useRef(createOrbUniforms());

  syncOrbUniforms(uniforms.current, {
    state,
    // When a live ref is driving audio, leave the raw slots alone so a
    // React re-render cannot stomp the value the render loop just wrote.
    audioLevel: audioRef ? uniforms.current.rawLevel : audioLevel,
    bass: audioRef ? uniforms.current.rawBass : bass,
    mids: audioRef ? uniforms.current.rawMids : mids,
    treble: audioRef ? uniforms.current.rawTreble : treble,
    intensity: INTENSITY,
    distortion: DISTORTION,
    paused,
  });

  return (
    <div
      className={className ?? "h-full w-full"}
      role="img"
      aria-label={`Jarvis is ${state}`}
    >
      <OrbScene uniforms={uniforms} audioRef={audioRef} />
    </div>
  );
}
