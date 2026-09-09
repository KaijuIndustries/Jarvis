const WORKLET_URL = "/audio/pcm-capture-processor.js";
export const PCM_WORKLET_NAME = "pcm-capture";

const workletReady = new WeakMap<AudioContext, Promise<void>>();

export function ensurePcmWorklet(context: AudioContext): Promise<void> {
  const existing = workletReady.get(context);
  if (existing) return existing;
  if (!context.audioWorklet) {
    return Promise.reject(new Error("This browser cannot capture raw microphone audio."));
  }
  const pending = context.audioWorklet.addModule(WORKLET_URL);
  workletReady.set(context, pending);
  return pending;
}
