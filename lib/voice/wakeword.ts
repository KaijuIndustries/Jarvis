export const WAKE_PHRASE = "Hey Friday";
export const MIN_WAKE_SCORE = 0.5;

export type WakeDetection = {
  type: "wake";
  phrase: typeof WAKE_PHRASE;
  score?: number;
};

export type WakeAudioResult =
  | { type: "ok" }
  | WakeDetection
  | { type: "error"; error: string };

export function isWakeDetection(value: unknown): value is WakeDetection {
  if (!value || typeof value !== "object") return false;
  const record = value as { type?: unknown; phrase?: unknown; score?: unknown };
  if (record.type !== "wake") return false;
  if (record.phrase !== WAKE_PHRASE) return false;
  if (record.score !== undefined && typeof record.score !== "number") return false;
  return true;
}

/** A wake event that is allowed to start listening. */
export function isAcceptedWake(value: unknown): value is WakeDetection {
  if (!isWakeDetection(value)) return false;
  if (typeof value.score === "number" && value.score < MIN_WAKE_SCORE) return false;
  return true;
}

export function parseWakeAudioResult(value: unknown): WakeAudioResult {
  if (isWakeDetection(value)) return value;
  if (value && typeof value === "object") {
    const record = value as { type?: unknown; error?: unknown };
    if (record.type === "error") {
      return {
        type: "error",
        error: typeof record.error === "string" ? record.error : "Wake detection failed.",
      };
    }
  }
  return { type: "ok" };
}
