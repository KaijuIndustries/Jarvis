/**
 * Visual profiles for each Orb state.
 * These are targets the energy solver eases toward — never snapped —
 * so a state change has weight instead of a hard cut.
 */
export type StateProfile = {
  swirl: number;
  distortGain: number;
  audioGain: number;
  particleGain: number;
  flareGain: number;
  jitter: number;
  pulseBase: number;
};

const PROFILES: StateProfile[] = [
  // idle — powered, waiting
  {
    swirl: 1.05,
    distortGain: 1,
    audioGain: 0.22,
    particleGain: 1,
    flareGain: 1.05,
    jitter: 0,
    pulseBase: 0,
  },
  // listening — surface is hungry, not larger
  {
    swirl: 1.35,
    distortGain: 1.5,
    audioGain: 1.15,
    particleGain: 1.35,
    flareGain: 1.75,
    jitter: 0.01,
    pulseBase: 0,
  },
  // thinking — internal circulation, ignore the mic
  {
    swirl: 2.35,
    distortGain: 1.12,
    audioGain: 0.12,
    particleGain: 1.18,
    flareGain: 0.8,
    jitter: 0,
    pulseBase: 0,
  },
  // speaking — voice sculpts energy, not size
  {
    swirl: 1.42,
    distortGain: 1.28,
    audioGain: 1.3,
    particleGain: 1.22,
    flareGain: 1.5,
    jitter: 0.008,
    pulseBase: 0,
  },
  // error — unstable, tasteful
  {
    swirl: 1.7,
    distortGain: 1.85,
    audioGain: 0.4,
    particleGain: 1.5,
    flareGain: 2.4,
    jitter: 0.075,
    pulseBase: 0.06,
  },
];

export function profileForState(state: number): StateProfile {
  const index = Math.min(Math.max(Math.round(state), 0), PROFILES.length - 1);
  return PROFILES[index];
}
