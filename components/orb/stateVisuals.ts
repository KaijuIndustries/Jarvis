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
    swirl: 1.16,
    distortGain: 1.18,
    audioGain: 1.05,
    particleGain: 1.12,
    flareGain: 1.28,
    jitter: 0.004,
    pulseBase: 0,
  },
  // thinking — same body as idle; no colour shift
  {
    swirl: 1.05,
    distortGain: 1,
    audioGain: 0.22,
    particleGain: 1,
    flareGain: 1.05,
    jitter: 0,
    pulseBase: 0,
  },
  // speaking — same body as idle; colour carries the state
  {
    swirl: 1.08,
    distortGain: 1,
    audioGain: 0.22,
    particleGain: 1,
    flareGain: 1.05,
    jitter: 0,
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
