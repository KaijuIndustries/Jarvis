export class VoiceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code: string) {
    super(message);
    this.name = "VoiceError";
    this.status = status;
    this.code = code;
  }
}

export function voiceUnavailable(): VoiceError {
  return new VoiceError(
    503,
    "Speech recognition is unavailable.",
    "whisper_unavailable",
  );
}

export function voiceTimeout(): VoiceError {
  return new VoiceError(504, "Speech recognition timed out.", "whisper_timeout");
}

export function invalidAudio(message = "The recording could not be processed."): VoiceError {
  return new VoiceError(400, message, "invalid_audio");
}
