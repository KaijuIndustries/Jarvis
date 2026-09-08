import type { OrbState } from "@/components/orb";

/**
 * Maps Jarvis application status onto Orb visual states.
 * The Orb itself does not know about Ollama, chat, or health checks.
 */
export function resolveOrbState(input: {
  streaming: boolean;
  healthOk: boolean;
  checkingHealth: boolean;
  recording?: boolean;
  transcribing?: boolean;
  voiceError?: boolean;
}): OrbState {
  if (input.voiceError) return "error";
  if (!input.checkingHealth && !input.healthOk) return "error";
  if (input.transcribing || input.streaming) return "thinking";
  if (input.recording) return "listening";
  return "idle";
}
