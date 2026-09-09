"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { JarvisOrb, type OrbAudioSource } from "@/components/orb";
import { useMicrophoneAnalyser } from "@/hooks/useMicrophoneAnalyser";
import { useMicrophoneSession } from "@/hooks/useMicrophoneSession";
import { useOrbSpeech } from "@/hooks/useOrbSpeech";
import { useOrbTurnMachine } from "@/hooks/useOrbTurnMachine";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";
import { useWakeWord } from "@/hooks/useWakeWord";
import { EMPTY_ORB_AUDIO } from "@/lib/client/audio-bands";
import { SentenceBuffer } from "@/lib/voice/sentence-buffer";
import { OrbConversation } from "./OrbConversation";
import { useJarvis } from "./jarvis-provider";
import { resolveOrbState } from "./resolveOrbState";

/**
 * Full-viewport Orb surface for /orb (future satellite screens).
 * Microphone analysis stays here and writes audioRef. The Orb only
 * visualises the values it is given.
 */
export function OrbMode() {
  const jarvis = useJarvis();
  const controlsReady = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const session = useMicrophoneSession();
  const audioRef = useRef<OrbAudioSource>({ ...EMPTY_ORB_AUDIO });
  const utteranceRef = useRef<(text: string | null) => void>(() => undefined);
  const wakeDisarmRef = useRef<() => void>(() => undefined);
  const onUtterance = useCallback((text: string | null) => {
    utteranceRef.current(text);
  }, []);
  const pauseWake = useCallback(() => {
    wakeDisarmRef.current();
  }, []);
  const voice = useVoiceCapture(session, onUtterance);
  const speech = useOrbSpeech({
    audioRef,
    context: session.context,
  });
  const turn = useOrbTurnMachine({
    voice,
    streaming: jarvis.streaming,
    speaking: speech.speaking,
    sendMessage: jarvis.sendMessage,
    pauseWake,
  });
  const wake = useWakeWord({
    session,
    enabled: turn.wakeArmed,
    onWake: turn.onWake,
  });
  useMicrophoneAnalyser(session, {
    audioRef,
    suppressWrites: speech.speaking,
  });
  const speechTurnRef = useRef<"idle" | "streaming">("idle");
  const spokenReplyRef = useRef("");
  const sentenceBufferRef = useRef(new SentenceBuffer());
  const startSpeechQueue = speech.startSpeechQueue;
  const queueSentence = speech.queueSentence;
  const finishSpeechQueue = speech.finishSpeechQueue;
  const stopSpeech = speech.stop;
  const assistantReply = lastAssistantContent(jarvis.activeConversation?.messages ?? []);

  useEffect(() => {
    utteranceRef.current = turn.handleUtterance;
  }, [turn.handleUtterance]);

  useEffect(() => {
    wakeDisarmRef.current = wake.disarm;
  }, [wake.disarm]);

  const state = resolveOrbState({
    streaming: jarvis.streaming,
    healthOk: jarvis.health.ok,
    checkingHealth: jarvis.checkingHealth,
    recording: voice.recording,
    transcribing: voice.transcribing,
    speaking: speech.speaking,
    voiceError: Boolean(session.error),
  });

  useEffect(() => {
    if (voice.recording || voice.transcribing) {
      speechTurnRef.current = "idle";
      spokenReplyRef.current = "";
      sentenceBufferRef.current.reset();
      stopSpeech();
      return;
    }

    if (jarvis.streaming && speechTurnRef.current !== "streaming") {
      speechTurnRef.current = "streaming";
      spokenReplyRef.current = "";
      sentenceBufferRef.current.reset();
      startSpeechQueue();
    }

    if (speechTurnRef.current === "streaming") {
      const previous = spokenReplyRef.current;
      const reply = assistantReply;
      if (reply.startsWith(previous)) {
        const delta = reply.slice(previous.length);
        spokenReplyRef.current = reply;
        if (delta) {
          for (const sentence of sentenceBufferRef.current.push(delta)) {
            queueSentence(sentence);
          }
        }
      }

      if (!jarvis.streaming) {
        speechTurnRef.current = "idle";
        for (const sentence of sentenceBufferRef.current.flush()) {
          queueSentence(sentence);
        }
        finishSpeechQueue();
      }
    }
  }, [
    assistantReply,
    finishSpeechQueue,
    jarvis.streaming,
    queueSentence,
    startSpeechQueue,
    stopSpeech,
    voice.recording,
    voice.transcribing,
  ]);

  useEffect(() => {
    void session.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-request mic once on /orb
  }, [session.start]);

  const statusError = session.error || voice.error || speech.error;
  const statusText = session.error
    ? session.error
    : voice.error
      ? voice.error
      : speech.error
        ? speech.error
        : voice.transcribing
          ? "Transcribing..."
          : voice.recording
            ? "Listening..."
            : jarvis.streaming
              ? "Thinking..."
              : speech.speaking
                ? "Speaking..."
                : turn.mode === "followup"
                  ? "Listening..."
                  : wake.status === "unavailable"
                    ? wake.error ?? "Wake word unavailable"
                    : "";

  return (
    <div className="fixed inset-0 h-dvh w-dvw overflow-hidden bg-[#05060a]">
      <JarvisOrb
        state={state}
        audioRef={audioRef}
        className="h-full w-full"
      />
      {controlsReady ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center px-4">
          <div className="pointer-events-auto flex w-full max-w-lg flex-col items-center gap-3 text-center">
            <OrbConversation
              conversation={jarvis.activeConversation}
              streaming={jarvis.streaming}
            />
            {!session.enabled ? (
              <button
                type="button"
                onClick={() => void session.start()}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/10 hover:text-white"
              >
                Enable microphone
              </button>
            ) : (
              <button
                type="button"
                disabled={voice.transcribing || jarvis.streaming || speech.speaking}
                onClick={() => {
                  if (voice.recording) turn.stopManual();
                  else turn.startManual();
                }}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {voice.recording ? "Stop" : "Start speaking"}
              </button>
            )}
            {statusText ? (
              <p
                className={
                  statusError
                    ? "text-[12px] text-[#c47c6e]"
                    : "text-[11px] tracking-wide text-white/35"
                }
              >
                {statusText}
              </p>
            ) : null}
            <p className="text-[10px] tracking-wide text-white/30">
              {wake.status === "armed"
                ? "Wake word: armed"
                : wake.status === "unavailable"
                  ? "Wake word: unavailable"
                  : "Wake word: off"}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function lastAssistantContent(
  messages: { role: string; content: string }[],
): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "assistant") return messages[i]?.content ?? "";
  }
  return "";
}
