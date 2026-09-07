import { profileForState } from "./stateVisuals";
import { ensureOrbUniforms, type OrbUniforms } from "./uniforms";

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/**
 * Exponential approach. Attack is used when the target is rising,
 * release when it is falling — so a word hits quickly and tails off
 * with weight instead of tracking every sample.
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
 * Damped spring. Stiffness pulls toward the target; damping kills
 * velocity. Together they overshoot a little and settle — mass.
 */
function spring(
  value: number,
  vel: number,
  target: number,
  stiffness: number,
  damping: number,
  dt: number,
): { value: number; vel: number } {
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

  store.distortGain = approach(store.distortGain, profile.distortGain, 3.2, 3.2, d);
  store.audioGain = approach(store.audioGain, profile.audioGain, 3.2, 3.2, d);
  store.particleGain = approach(
    store.particleGain,
    profile.particleGain,
    2.8,
    2.8,
    d,
  );
  store.flareGain = approach(store.flareGain, profile.flareGain, 3.6, 3.6, d);
  store.jitter = approach(store.jitter, profile.jitter, 8, 4, d);
  store.pulseBase = approach(store.pulseBase, profile.pulseBase, 4, 4, d);

  store.sLevel = approach(store.sLevel, clamp01(store.rawLevel), 14, 3.1, d);
  store.sBass = approach(store.sBass, clamp01(store.rawBass), 10, 2.5, d);
  store.sMids = approach(store.sMids, clamp01(store.rawMids), 13, 4.0, d);
  store.sTreble = approach(store.sTreble, clamp01(store.rawTreble), 18, 6.4, d);

  // Shaders read these — always the smoothed bands, never the raw spike.
  store.audioLevel = store.sLevel;
  store.bass = store.sBass;
  store.mids = store.sMids;
  store.treble = store.sTreble;

  let energyT = store.sLevel * profile.audioGain;
  let coreT = store.sBass * (0.5 + profile.audioGain * 0.5);
  let turbT = store.sMids * (0.45 + profile.distortGain * 0.4);
  let sparkT = store.sTreble * (0.4 + profile.flareGain * 0.22);
  let waveT = 0;
  let sizeT = 0;

  if (idle) {
    const inhale = 0.5 + 0.5 * Math.sin(store.time * 1.05);
    const rest = 0.5 + 0.5 * Math.sin(store.time * 0.47 + 1.4);
    let idleBreath = inhale * 0.72 + rest * 0.28;
    idleBreath = idleBreath * idleBreath * (3 - 2 * idleBreath);
    const deep = 0.5 + 0.5 * Math.sin(store.time * 0.31 + 1.1);
    const surface = 0.5 + 0.5 * Math.sin(store.time * 0.19);
    energyT = 0.05 + idleBreath * 0.12;
    coreT = 0.055 + deep * 0.03;
    turbT = 0.09 + surface * 0.04;
    sparkT = 0.035;
    const murmur = Math.max(
      0,
      Math.sin(store.time * 0.23) * Math.sin(store.time * 0.41),
    );
    // Always some edge-lapping, even when nobody is talking.
    waveT = 0.34 + murmur * 0.14;
  } else if (think) {
    const cycle = 0.5 + 0.5 * Math.sin(store.time * 1.05);
    const beat = Math.pow(Math.max(0, Math.sin(store.time * 1.35)), 10);
    energyT = 0.2 + cycle * 0.1;
    coreT = 0.3 + cycle * 0.2 + beat * 0.38;
    turbT = 0.18 + 0.1 * Math.sin(store.time * 0.68);
    sparkT = 0.07 + beat * 0.14;
    waveT = 0.4 + cycle * 0.16 + beat * 0.28;
  } else if (listen || speak) {
    // Roughly a six second breath at the current global time scale.
    const wave = 0.5 + 0.5 * Math.sin(store.time * 4.4);
    const glide = wave * wave * (3 - 2 * wave);
    // Swings either side of the resting shape, so the Orb contracts as
    // well as expands rather than only ever inflating.
    sizeT = -0.12 + glide * 0.52 + store.sLevel * 0.3;
    energyT = 0.1;
    turbT = Math.max(turbT, 0.14);
    coreT = Math.max(coreT, 0.06);
    const rise = store.sLevel - store.prevLevel;
    if (rise > 0.04) {
      store.waveTarget = Math.min(1.15, store.waveTarget + rise * 2.2);
    }
    waveT = 0.32 + store.sLevel * 0.55;
  } else if (error) {
    energyT = 0.18 + store.sLevel * 0.25;
    coreT = 0.16;
    turbT = 0.34;
    sparkT = 0.18;
    waveT = 0.28 + 0.2 * Math.sin(store.time * 3.2);
  }

  store.waveTarget = approach(store.waveTarget, waveT, 9, 1.55, d);

  const energy = spring(store.energy, store.energyVel, energyT, 36, 5.2, d);
  store.energy = energy.value;
  store.energyVel = energy.vel;

  const core = spring(store.coreDrive, store.coreVel, coreT, 20, 4.1, d);
  store.coreDrive = core.value;
  store.coreVel = core.vel;

  const turb = spring(store.turbulence, store.turbVel, turbT, 30, 5.6, d);
  store.turbulence = turb.value;
  store.turbVel = turb.vel;

  const spark = spring(store.spark, store.sparkVel, sparkT, 62, 8.8, d);
  store.spark = spark.value;
  store.sparkVel = spark.vel;

  const wave = spring(store.waveAmp, store.waveVel, store.waveTarget, 26, 4.6, d);
  store.waveAmp = wave.value;
  store.waveVel = wave.vel;

  const flow = spring(store.flow, store.flowVel, profile.swirl, 7.5, 3.4, d);
  store.flow = flow.value;
  store.flowVel = flow.vel;
  store.swirl = store.flow;

  store.wavePhase += d * (0.32 + store.waveAmp * 0.7 + store.flow * 0.08);
  store.prevLevel = store.sLevel;

  const size = spring(store.breathe, store.breatheVel, sizeT, 16, 4.6, d);
  store.breathe = size.value;
  store.breatheVel = size.vel;
}
