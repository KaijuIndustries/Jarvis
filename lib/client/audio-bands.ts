import type { OrbAudioSource } from "@/components/orb";

export const ORB_FFT_SIZE = 2048;
const ATTACK = 0.42;
const RELEASE = 0.14;

export const EMPTY_ORB_AUDIO: OrbAudioSource = {
  audioLevel: 0,
  bass: 0,
  mids: 0,
  treble: 0,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function approachBand(current: number, target: number): number {
  const rate = target > current ? ATTACK : RELEASE;
  return current + (target - current) * rate;
}

function bandMean(
  bins: Uint8Array,
  sampleRate: number,
  lowHz: number,
  highHz: number,
): number {
  const binWidth = sampleRate / ORB_FFT_SIZE;
  const start = Math.max(0, Math.floor(lowHz / binWidth));
  const end = Math.min(bins.length - 1, Math.ceil(highHz / binWidth));
  if (end < start) return 0;
  let sum = 0;
  for (let i = start; i <= end; i += 1) sum += bins[i];
  return sum / (end - start + 1) / 255;
}

function rmsLevel(time: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < time.length; i += 1) {
    const sample = (time[i] - 128) / 128;
    sum += sample * sample;
  }
  return Math.sqrt(sum / time.length);
}

export function readOrbBands(
  analyser: AnalyserNode,
  sampleRate: number,
  freq: Uint8Array<ArrayBuffer>,
  time: Uint8Array<ArrayBuffer>,
): OrbAudioSource {
  analyser.getByteFrequencyData(freq);
  analyser.getByteTimeDomainData(time);
  return {
    audioLevel: clamp01(rmsLevel(time) * 3.4),
    bass: clamp01(bandMean(freq, sampleRate, 20, 250) * 2.6),
    mids: clamp01(bandMean(freq, sampleRate, 250, 2000) * 3.1),
    treble: clamp01(bandMean(freq, sampleRate, 2000, 10000) * 3.8),
  };
}

export function writeOrbAudio(
  target: OrbAudioSource,
  next: OrbAudioSource,
  smooth: OrbAudioSource,
) {
  smooth.audioLevel = approachBand(smooth.audioLevel, next.audioLevel);
  smooth.bass = approachBand(smooth.bass, next.bass);
  smooth.mids = approachBand(smooth.mids, next.mids);
  smooth.treble = approachBand(smooth.treble, next.treble);
  target.audioLevel = smooth.audioLevel;
  target.bass = smooth.bass;
  target.mids = smooth.mids;
  target.treble = smooth.treble;
}

export function resetOrbAudio(target: OrbAudioSource) {
  target.audioLevel = 0;
  target.bass = 0;
  target.mids = 0;
  target.treble = 0;
}
