export const ORB_FOLLOWUP_MS = 5_000;
export const ORB_COMMAND_WAIT_MS = 8_000;
export const ORB_COMMAND_PREROLL_MS = 450;
export const ORB_COMMAND_SILENCE_MS = 1_000;
export const ORB_VOICE_RMS = 0.018;

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

export function shouldStartFollowup(input: {
  pendingFollowup: boolean;
  streaming: boolean;
  speaking: boolean;
  recording: boolean;
  transcribing: boolean;
}): boolean {
  return (
    input.pendingFollowup &&
    !input.streaming &&
    !input.speaking &&
    !input.recording &&
    !input.transcribing
  );
}
