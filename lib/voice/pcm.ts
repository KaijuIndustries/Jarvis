export const PCM_RATE = 16_000;
export const PCM_WIDTH = 2;
export const PCM_CHANNELS = 1;
export const MAX_UTTERANCE_SECONDS = 30;
export const MIN_UTTERANCE_SECONDS = 0.25;
export const SILENCE_RMS = 0.01;

const MAX_UTTERANCE_BYTES = MAX_UTTERANCE_SECONDS * PCM_RATE * PCM_WIDTH * PCM_CHANNELS;

export function maxPcmBytesForRate(rate: number, width: number, channels: number): number {
  return Math.ceil(MAX_UTTERANCE_SECONDS * rate * width * channels) + rate * width * channels;
}

export function float32ToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const clipped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    out[i] = clipped < 0 ? Math.round(clipped * 0x8000) : Math.round(clipped * 0x7fff);
  }
  return out;
}

export function int16ToBytes(samples: Int16Array): Uint8Array {
  return new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
}

export function bytesToInt16(bytes: Uint8Array): Int16Array {
  if (bytes.byteLength % 2 !== 0) {
    throw new Error("PCM byte length must be even");
  }
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

export function resampleInt16Mono(
  samples: Int16Array,
  fromRate: number,
  toRate: number,
): Int16Array {
  if (fromRate === toRate) return samples;
  if (fromRate <= 0 || toRate <= 0) {
    throw new Error("Sample rates must be positive");
  }

  if (fromRate === 48_000 && toRate === 16_000) {
    const out = new Int16Array(Math.floor(samples.length / 3));
    for (let i = 0; i < out.length; i += 1) {
      const a = samples[i * 3] ?? 0;
      const b = samples[i * 3 + 1] ?? 0;
      const c = samples[i * 3 + 2] ?? 0;
      out[i] = Math.round((a + b + c) / 3);
    }
    return out;
  }

  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.round(samples.length / ratio));
  const out = new Int16Array(outLength);
  const last = Math.max(0, samples.length - 1);
  for (let i = 0; i < outLength; i += 1) {
    const src = i * ratio;
    const i0 = Math.min(last, Math.floor(src));
    const i1 = Math.min(last, i0 + 1);
    const frac = src - i0;
    const s0 = samples[i0] ?? 0;
    const s1 = samples[i1] ?? 0;
    out[i] = Math.round(s0 + (s1 - s0) * frac);
  }
  return out;
}

export function pcmDurationSeconds(
  byteLength: number,
  rate: number,
  width: number,
  channels: number,
): number {
  const frameBytes = width * channels;
  if (frameBytes <= 0 || rate <= 0) return 0;
  return byteLength / frameBytes / rate;
}

export function int16Rms(samples: Int16Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = (samples[i] ?? 0) / 32768;
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
}

export function float32Rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i] ?? 0;
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
}

export function isSilentUtterance(samples: Int16Array, rate: number): boolean {
  const duration = samples.length / rate;
  if (duration < MIN_UTTERANCE_SECONDS) return true;
  return int16Rms(samples) < SILENCE_RMS;
}

export function assertPcmLimits(byteLength: number, rate: number, width: number, channels: number) {
  if (byteLength > Math.max(MAX_UTTERANCE_BYTES, maxPcmBytesForRate(rate, width, channels))) {
    throw new Error("utterance_too_long");
  }
}
