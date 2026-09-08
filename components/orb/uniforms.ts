"use client";

import { createContext, useContext, type MutableRefObject } from "react";
import type { OrbState } from "./types";

export const ORB_STATE_INDEX: Record<OrbState, number> = {
  idle: 0,
  listening: 1,
  thinking: 2,
  speaking: 3,
  error: 4,
};

/**
 * Values the shaders and animation loop read every frame.
 * Kept as a plain mutable object so audio/time can change
 * without triggering React renders.
 */
export type OrbUniforms = {
  phaseSlow: number;
  phaseMain: number;
  phaseQuick: number;
  rawLevel: number;
  rawBass: number;
  rawMids: number;
  rawTreble: number;
  sLevel: number;
  sBass: number;
  sMids: number;
  sTreble: number;
  audioLevel: number;
  bass: number;
  mids: number;
  treble: number;
  state: number;
  intensity: number;
  distortion: number;
  pulse: number;
  paused: number;
  swirl: number;
  distortGain: number;
  audioGain: number;
  particleGain: number;
  flareGain: number;
  jitter: number;
  pulseBase: number;
  energy: number;
  energyVel: number;
  coreDrive: number;
  coreVel: number;
  turbulence: number;
  turbVel: number;
  spark: number;
  sparkVel: number;
  waveAmp: number;
  waveVel: number;
  waveTarget: number;
  wavePhase: number;
  flow: number;
  flowVel: number;
  prevLevel: number;
  breathe: number;
  breatheVel: number;
  listenTint: number;
  speakTint: number;
  thinkTint: number;
  lastState: number;
};

/**
 * Runs every frame, so the defaults are built once at module scope
 * rather than allocated per tick.
 */
const UNIFORM_DEFAULTS = createOrbUniforms();
const UNIFORM_KEYS = Object.keys(UNIFORM_DEFAULTS) as (keyof OrbUniforms)[];

export function ensureOrbUniforms(target: OrbUniforms) {
  for (const key of UNIFORM_KEYS) {
    const value = target[key];
    if (typeof value !== "number" || Number.isNaN(value)) {
      target[key] = UNIFORM_DEFAULTS[key];
    }
  }
  return target;
}

export function createOrbUniforms(): OrbUniforms {
  return {
    phaseSlow: 0,
    phaseMain: 0,
    phaseQuick: 0,
    rawLevel: 0,
    rawBass: 0,
    rawMids: 0,
    rawTreble: 0,
    sLevel: 0,
    sBass: 0,
    sMids: 0,
    sTreble: 0,
    audioLevel: 0,
    bass: 0,
    mids: 0,
    treble: 0,
    state: 0,
    intensity: 1,
    distortion: 0.35,
    pulse: 0,
    paused: 0,
    swirl: 1,
    distortGain: 1,
    audioGain: 0.3,
    particleGain: 1,
    flareGain: 1,
    jitter: 0,
    pulseBase: 0,
    energy: 0.08,
    energyVel: 0,
    coreDrive: 0.05,
    coreVel: 0,
    turbulence: 0.08,
    turbVel: 0,
    spark: 0.03,
    sparkVel: 0,
    waveAmp: 0,
    waveVel: 0,
    waveTarget: 0,
    wavePhase: 0,
    flow: 1,
    flowVel: 0,
    prevLevel: 0,
    breathe: 0,
    breatheVel: 0,
    listenTint: 0,
    speakTint: 0,
    thinkTint: 0,
    lastState: 0,
  };
}

/** Internal sync payload. Not part of the public component API. */
export type OrbUniformInputs = {
  state: OrbState;
  audioLevel: number;
  bass: number;
  mids: number;
  treble: number;
  intensity: number;
  distortion: number;
  paused: boolean;
};

export function syncOrbUniforms(target: OrbUniforms, props: OrbUniformInputs) {
  ensureOrbUniforms(target);
  target.rawLevel = props.audioLevel;
  target.rawBass = props.bass;
  target.rawMids = props.mids;
  target.rawTreble = props.treble;
  target.intensity = props.intensity;
  target.distortion = props.distortion;
  target.state = ORB_STATE_INDEX[props.state];
  target.paused = props.paused ? 1 : 0;
}

/**
 * Every field is optional: a layer only declares the uniforms its
 * shader actually reads. A uniform that a shader declares but never
 * uses is stripped by the GLSL compiler, so writing to it every frame
 * looks like working animation while doing nothing at all.
 */
type ShaderBag = {
  uPhase?: { value: { x: number; y: number; z: number } };
  uAudioLevel?: { value: number };
  uBass?: { value: number };
  uMids?: { value: number };
  uTreble?: { value: number };
  uState?: { value: number };
  uIntensity?: { value: number };
  uDistortion?: { value: number };
  uPulse?: { value: number };
  uSwirl?: { value: number };
  uAudioGain?: { value: number };
  uJitter?: { value: number };
  uEnergy?: { value: number };
  uCoreDrive?: { value: number };
  uTurbulence?: { value: number };
  uSpark?: { value: number };
  uWavePhase?: { value: number };
  uWaveAmp?: { value: number };
  uFlow?: { value: number };
  uSize?: { value: number };
  uListen?: { value: number };
  uSpeak?: { value: number };
  uThink?: { value: number };
};

export function writeLayerUniforms(bag: ShaderBag, src: OrbUniforms) {
  if (bag.uPhase) {
    bag.uPhase.value.x = src.phaseSlow;
    bag.uPhase.value.y = src.phaseMain;
    bag.uPhase.value.z = src.phaseQuick;
  }
  if (bag.uWavePhase) bag.uWavePhase.value = src.wavePhase;
  if (bag.uAudioLevel) bag.uAudioLevel.value = src.audioLevel;
  if (bag.uBass) bag.uBass.value = src.bass;
  if (bag.uMids) bag.uMids.value = src.mids;
  if (bag.uTreble) bag.uTreble.value = src.treble;
  if (bag.uState) bag.uState.value = src.state;
  if (bag.uIntensity) bag.uIntensity.value = src.intensity;
  if (bag.uDistortion) bag.uDistortion.value = src.distortion * src.distortGain;
  if (bag.uPulse) {
    bag.uPulse.value = src.pulseBase + src.energy * 0.12 + src.coreDrive * 0.08;
  }
  if (bag.uSwirl) bag.uSwirl.value = src.flow;
  if (bag.uAudioGain) bag.uAudioGain.value = src.audioGain;
  if (bag.uJitter) bag.uJitter.value = src.jitter;
  if (bag.uEnergy) bag.uEnergy.value = src.energy;
  if (bag.uCoreDrive) bag.uCoreDrive.value = src.coreDrive;
  if (bag.uTurbulence) bag.uTurbulence.value = src.turbulence;
  if (bag.uSpark) bag.uSpark.value = src.spark;
  if (bag.uWaveAmp) bag.uWaveAmp.value = src.waveAmp;
  if (bag.uFlow) bag.uFlow.value = src.flow;
  if (bag.uSize) bag.uSize.value = src.breathe;
  if (bag.uListen) bag.uListen.value = src.listenTint;
  if (bag.uSpeak) bag.uSpeak.value = src.speakTint;
  if (bag.uThink) bag.uThink.value = src.thinkTint;
}

export const OrbUniformsContext =
  createContext<MutableRefObject<OrbUniforms> | null>(null);

export function useOrbUniforms() {
  const value = useContext(OrbUniformsContext);
  if (!value) {
    throw new Error("useOrbUniforms must be used inside the Orb scene.");
  }
  return value;
}
