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

export function ttsUnavailable(): VoiceError {
  return new VoiceError(503, "Speech synthesis is unavailable.", "piper_unavailable");
}

export function ttsTimeout(): VoiceError {
  return new VoiceError(504, "Speech synthesis timed out.", "piper_timeout");
}

export function ttsClosed(): VoiceError {
  return new VoiceError(502, "Speech synthesis closed the connection.", "piper_closed");
}

export function invalidSpeech(message = "There was nothing to speak."): VoiceError {
  return new VoiceError(400, message, "invalid_speech");
}
