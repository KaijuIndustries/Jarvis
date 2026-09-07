import type { OrbState } from "@/components/orb";

/**
 * Maps Jarvis application status onto Orb visual states.
 * The Orb itself does not know about Ollama, chat, or health checks.
 */
export function resolveOrbState(input: {
  streaming: boolean;
  healthOk: boolean;
  checkingHealth: boolean;
}): OrbState {
  if (!input.checkingHealth && !input.healthOk) return "error";
  if (input.streaming) return "thinking";
  return "idle";
}
