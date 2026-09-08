import { profileForState } from "./stateVisuals";
import { ensureOrbUniforms, type OrbUniforms } from "./uniforms";

const TAU = Math.PI * 2;

/** Radians per real second. Each loop wraps at 2π so the animation
 *  never accumulates a clock. Rates match the old TIME_SCALE=0.24 look. */
const PHASE_SLOW = 0.113;
const PHASE_MAIN = 0.252;
const PHASE_QUICK = 0.372;

function wrapTau(phase: number) {
  const wrapped = phase % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}

export function advanceLoop(store: OrbUniforms, dt: number) {
  store.phaseSlow = wrapTau(store.phaseSlow + PHASE_SLOW * dt);
  store.phaseMain = wrapTau(store.phaseMain + PHASE_MAIN * dt);
  store.phaseQuick = wrapTau(store.phaseQuick + PHASE_QUICK * dt);
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/**
 * Exponential approach. Attack is used when the target is rising,
 * release when the target is falling — so a word hits quickly and tails
 * off with weight instead of tracking every sample.
 */
function approach(
  current: number,
  target: number,
  attack: number,
  release: number,
  dt: number,
) {
  const rate = target > current ? attack : release;
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/**
 * Damped spring. zeta >= 1 settles without ringing; below 1 overshoots.
 * Mode changes used to ring for ~2s because damping was well under critical.
 */
function spring(
  value: number,
  vel: number,
  target: number,
  stiffness: number,
  zeta: number,
  dt: number,
): { value: number; vel: number } {
  const damping = 2 * Math.sqrt(stiffness) * zeta;
  let nextVel = vel + (target - value) * stiffness * dt;
  nextVel *= Math.exp(-damping * dt);
  return { value: value + nextVel * dt, vel: nextVel };
}

/**
 * Per-frame energy solver. Raw audio is never written straight
 * into shaders — it is smoothed, then sprung into independent
 * channels so each layer can react on its own time scale.
 */
export function tickEnergy(store: OrbUniforms, dt: number) {
  ensureOrbUniforms(store);
  const d = Math.min(Math.max(dt, 0), 0.05);
  const profile = profileForState(store.state);
  const state = Math.round(store.state);
  const idle = state === 0;
  const listen = state === 1;
  const think = state === 2;
  const speak = state === 3;
  const error = state === 4;

  // After a long sit in idle/think the springs are already moving with
  // the breath cycle. A mode change that keeps that velocity lunges
  // instead of settling. Drop it so every swap eases from rest.
  if (state !== store.lastState) {
    store.energyVel = 0;
    store.coreVel = 0;
    store.turbVel = 0;
    store.sparkVel = 0;
    store.waveVel = 0;
    store.flowVel = 0;
    store.breatheVel = 0;
    store.lastState = state;
  }

  store.distortGain = approach(store.distortGain, profile.distortGain, 1.6, 1.6, d);
  store.audioGain = approach(store.audioGain, profile.audioGain, 1.6, 1.6, d);
  store.particleGain = approach(
    store.particleGain,
    profile.particleGain,
    1.4,
    1.4,
    d,
  );
  store.flareGain = approach(store.flareGain, profile.flareGain, 1.8, 1.8, d);
  store.jitter = approach(store.jitter, profile.jitter, 4, 3, d);
  store.pulseBase = approach(store.pulseBase, profile.pulseBase, 2.2, 2.2, d);

  store.sLevel = approach(store.sLevel, clamp01(store.rawLevel), 10, 2.4, d);
  store.sBass = approach(store.sBass, clamp01(store.rawBass), 8, 2.0, d);
  store.sMids = approach(store.sMids, clamp01(store.rawMids), 10, 3.2, d);
  store.sTreble = approach(store.sTreble, clamp01(store.rawTreble), 12, 4.8, d);

  // Shaders read these — always the smoothed bands, never the raw spike.
  store.audioLevel = store.sLevel;
  store.bass = store.sBass;
  store.mids = store.sMids;
  store.treble = store.sTreble;

  // Colour is the state signal. Ease it on the same clock as the other
  // profile gains so listening/speaking do not snap to green or white.
  store.listenTint = approach(store.listenTint, listen ? 1 : 0, 1.8, 1.6, d);
  store.speakTint = approach(store.speakTint, speak ? 1 : 0, 1.8, 1.6, d);
  store.thinkTint = approach(store.thinkTint, think ? 1 : 0, 5.5, 2.75, d);

  let energyT = store.sLevel * profile.audioGain;
  let coreT = store.sBass * (0.5 + profile.audioGain * 0.5);
  let turbT = store.sMids * (0.45 + profile.distortGain * 0.4);
  let sparkT = store.sTreble * (0.4 + profile.flareGain * 0.22);
  let waveT = 0;
  let sizeT = 0;

  if (idle || think) {
    const inhale = 0.5 + 0.5 * Math.sin(store.phaseMain);
    const rest = 0.5 + 0.5 * Math.sin(store.phaseSlow + 1.4);
    let idleBreath = inhale * 0.72 + rest * 0.28;
    idleBreath = idleBreath * idleBreath * (3 - 2 * idleBreath);
    const deep = 0.5 + 0.5 * Math.sin(store.phaseSlow + 1.1);
    const surface = 0.5 + 0.5 * Math.sin(store.phaseSlow * 2);
    energyT = 0.05 + idleBreath * 0.12;
    coreT = 0.055 + deep * 0.03;
    turbT = 0.09 + surface * 0.04;
    sparkT = 0.035;
    const murmur = Math.max(
      0,
      Math.sin(store.phaseSlow) * Math.sin(store.phaseMain),
    );
    waveT = 0.34 + murmur * 0.14;
  } else if (listen) {
    const wave = 0.5 + 0.5 * Math.sin(store.phaseQuick);
    const glide = wave * wave * (3 - 2 * wave);
    sizeT = -0.02 + glide * 0.07 + store.sLevel * 0.05;
    energyT = 0.1;
    turbT = Math.max(turbT, 0.12);
    coreT = Math.max(coreT, 0.06);
    const rise = store.sLevel - store.prevLevel;
    if (rise > 0.05) {
      store.waveTarget = Math.min(0.7, store.waveTarget + rise * 0.9);
    }
    waveT = 0.32 + store.sLevel * 0.28;
  } else if (speak) {
    energyT = 0.1;
    coreT = 0.08;
    turbT = 0.1;
    sparkT = 0.04;
    sizeT = 0;
    waveT = 0.34;
  } else if (error) {
    energyT = 0.16 + store.sLevel * 0.18;
    coreT = 0.14;
    turbT = 0.22;
    sparkT = 0.12;
    waveT = 0.28 + 0.1 * Math.sin(store.phaseQuick);
  }

  store.waveTarget = approach(store.waveTarget, waveT, 3.2, 1.4, d);

  const energy = spring(store.energy, store.energyVel, energyT, 11, 1.08, d);
  store.energy = energy.value;
  store.energyVel = energy.vel;

  const core = spring(store.coreDrive, store.coreVel, coreT, 9, 1.08, d);
  store.coreDrive = core.value;
  store.coreVel = core.vel;

  const turb = spring(store.turbulence, store.turbVel, turbT, 10, 1.08, d);
  store.turbulence = turb.value;
  store.turbVel = turb.vel;

  const spark = spring(store.spark, store.sparkVel, sparkT, 14, 1.1, d);
  store.spark = spark.value;
  store.sparkVel = spark.vel;

  const wave = spring(store.waveAmp, store.waveVel, store.waveTarget, 9, 1.08, d);
  store.waveAmp = wave.value;
  store.waveVel = wave.vel;

  const flow = spring(store.flow, store.flowVel, profile.swirl, 5.5, 1.12, d);
  store.flow = flow.value;
  store.flowVel = flow.vel;
  store.swirl = store.flow;

  store.wavePhase = wrapTau(
    store.wavePhase + d * (0.28 + store.waveAmp * 0.35 + store.flow * 0.04),
  );
  store.prevLevel = store.sLevel;

  const size = spring(store.breathe, store.breatheVel, sizeT, 7, 1.15, d);
  store.breathe = size.value;
  store.breatheVel = size.vel;
}
