export const ORB_FOLLOWUP_MS = 5_000;
export const ORB_COMMAND_WAIT_MS = 8_000;
export const ORB_COMMAND_PREROLL_MS = 450;
export const ORB_COMMAND_SILENCE_MS = 1_000;
export const ORB_VOICE_RMS = 0.018;
export const ORB_POST_SPEECH_MS = 400;

export type OrbMicMode = "passive" | "command" | "followup";

export function shouldArmWake(input: {
  mode: OrbMicMode;
  recording: boolean;
  transcribing: boolean;
  streaming: boolean;
  speaking: boolean;
}): boolean {
  return (
    input.mode === "passive" &&
    !input.recording &&
    !input.transcribing &&
    !input.streaming &&
    !input.speaking
  );
}

/**
 * Automatic follow-up capture is disabled: listening starts only after
 * a confirmed wake word (or an explicit press of Start speaking).
 */
export function shouldStartFollowup(_input: {
  pendingFollowup: boolean;
  streaming: boolean;
  speaking: boolean;
  recording: boolean;
  transcribing: boolean;
}): boolean {
  return false;
}

export function shouldBeginListening(input: {
  source: "wake" | "followup" | "manual";
  phraseMatched: boolean;
}): boolean {
  if (input.source === "followup") return false;
  if (input.source === "manual") return true;
  return input.phraseMatched;
}

export function shouldReturnToPassive(input: {
  turnInProgress: boolean;
  sawBusy: boolean;
  streaming: boolean;
  speaking: boolean;
  recording: boolean;
  transcribing: boolean;
}): boolean {
  return (
    input.turnInProgress &&
    input.sawBusy &&
    !input.streaming &&
    !input.speaking &&
    !input.recording &&
    !input.transcribing
  );
}
