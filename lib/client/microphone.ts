export function describeMicError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Microphone permission was denied.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone is available.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The microphone is already in use or could not be opened.";
  }
  if (name === "SecurityError") {
    return "Microphone access is blocked in this context. Use localhost or HTTPS.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Microphone is unavailable.";
}

export function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext ||
    null
  );
}

export function getOfflineAudioContextConstructor(): typeof OfflineAudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.OfflineAudioContext ||
    (
      window as typeof window & {
        webkitOfflineAudioContext?: typeof OfflineAudioContext;
      }
    ).webkitOfflineAudioContext ||
    null
  );
}

export async function resampleFloat32(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Promise<Float32Array> {
  if (fromRate === toRate) return samples;
  const Offline = getOfflineAudioContextConstructor();
  if (!Offline) {
    throw new Error("This browser cannot resample microphone audio.");
  }

  const frameCount = Math.max(1, Math.round((samples.length * toRate) / fromRate));
  const context = new Offline(1, frameCount, toRate);
  const buffer = context.createBuffer(1, samples.length, fromRate);
  buffer.getChannelData(0).set(samples);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
  const rendered = await context.startRendering();
  const output = new Float32Array(rendered.length);
  output.set(rendered.getChannelData(0));
  return output;
}
