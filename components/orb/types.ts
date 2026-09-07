import type { MutableRefObject } from "react";

export const ORB_STATES = [
  "idle",
  "listening",
  "thinking",
  "speaking",
  "error",
] as const;

export type OrbState = (typeof ORB_STATES)[number];

/**
 * Normalised audio bands, 0 → 1.
 * The same shape a later Web Audio analyser should write.
 */
export type OrbAudioSource = {
  audioLevel: number;
  bass: number;
  mids: number;
  treble: number;
};

/**
 * Public Orb API. The parent chooses the logical state and may supply
 * audio. Visual gain, distortion and shader uniforms stay internal.
 */
export type JarvisOrbProps = {
  /** Visual mode. Transitions are sprung inside the Orb. Default: idle. */
  state?: OrbState;
  /** Overall RMS / loudness, 0 → 1. Ignored when `audioRef` is set. */
  audioLevel?: number;
  /** Low-frequency energy, 0 → 1. Ignored when `audioRef` is set. */
  bass?: number;
  /** Mid-frequency energy, 0 → 1. Ignored when `audioRef` is set. */
  mids?: number;
  /** High-frequency energy, 0 → 1. Ignored when `audioRef` is set. */
  treble?: number;
  /**
   * Optional per-frame audio source. When present, the render loop
   * reads this ref instead of the numeric props — the slot a Web
   * Audio analyser should write into later.
   */
  audioRef?: MutableRefObject<OrbAudioSource>;
  /** Freeze the animation clock without unmounting. Default: false. */
  paused?: boolean;
  /** Sizes the WebGL canvas to this element. Default: h-full w-full. */
  className?: string;
};
