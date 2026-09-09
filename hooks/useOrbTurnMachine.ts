"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ORB_COMMAND_PREROLL_MS,
  ORB_COMMAND_SILENCE_MS,
  ORB_COMMAND_WAIT_MS,
  shouldArmWake,
  shouldBeginListening,
  shouldReturnToPassive,
  type OrbMicMode,
} from "@/lib/voice/orb-turn";
import type { useVoiceCapture } from "./useVoiceCapture";

type Voice = ReturnType<typeof useVoiceCapture>;

/**
 * Hands-free orb turn: confirmed wake → command capture → passive.
 * Listening never auto-starts after a reply.
 */
export function useOrbTurnMachine(input: {
  voice: Voice;
  streaming: boolean;
  speaking: boolean;
  sendMessage: (text: string) => Promise<void>;
  pauseWake: () => void;
}) {
  const [mode, setMode] = useState<OrbMicMode>("passive");
  const consumedRef = useRef(false);
  const turnInProgressRef = useRef(false);
  const sawBusyRef = useRef(false);
  const modeRef = useRef<OrbMicMode>("passive");
  const startCapture = input.voice.start;
  const cancelCapture = input.voice.cancel;
  const sendMessage = input.sendMessage;
  const pauseWake = input.pauseWake;

  const setMicMode = useCallback((next: OrbMicMode) => {
    modeRef.current = next;
    setMode(next);
  }, []);

  const resetTurnFlags = useCallback(() => {
    consumedRef.current = false;
    turnInProgressRef.current = false;
    sawBusyRef.current = false;
  }, []);

  const beginCommand = useCallback(
    (waitForSpeechMs: number) => {
      if (input.voice.recording || input.voice.transcribing || input.streaming || input.speaking) {
        return;
      }
      pauseWake();
      resetTurnFlags();
      setMicMode("command");
      void startCapture({
        autoStop: true,
        waitForSpeechMs,
        prerollMs: ORB_COMMAND_PREROLL_MS,
        silenceMs: ORB_COMMAND_SILENCE_MS,
      }).then((started) => {
        if (!started) setMicMode("passive");
      });
    },
    [
      input.speaking,
      input.streaming,
      input.voice.recording,
      input.voice.transcribing,
      pauseWake,
      resetTurnFlags,
      setMicMode,
      startCapture,
    ],
  );

  const onWake = useCallback(() => {
    if (
      !shouldBeginListening({
        source: "wake",
        phraseMatched: true,
      })
    ) {
      return;
    }
    if (modeRef.current !== "passive") return;
    beginCommand(ORB_COMMAND_WAIT_MS);
  }, [beginCommand]);

  const handleUtterance = useCallback(
    (text: string | null) => {
      const trimmed = text?.trim() ?? "";
      if (trimmed) {
        if (consumedRef.current) return;
        consumedRef.current = true;
        turnInProgressRef.current = true;
        sawBusyRef.current = false;
        void sendMessage(trimmed).catch(() => {
          resetTurnFlags();
          setMicMode("passive");
        });
        return;
      }

      resetTurnFlags();
      setMicMode("passive");
    },
    [resetTurnFlags, sendMessage, setMicMode],
  );

  useEffect(() => {
    if (input.streaming || input.speaking) {
      if (turnInProgressRef.current) {
        sawBusyRef.current = true;
      }
      return;
    }
    if (
      shouldReturnToPassive({
        turnInProgress: turnInProgressRef.current,
        sawBusy: sawBusyRef.current,
        streaming: input.streaming,
        speaking: input.speaking,
        recording: input.voice.recording,
        transcribing: input.voice.transcribing,
      })
    ) {
      resetTurnFlags();
      const timer = window.setTimeout(() => setMicMode("passive"), 0);
      return () => window.clearTimeout(timer);
    }
  }, [
    input.speaking,
    input.streaming,
    input.voice.recording,
    input.voice.transcribing,
    resetTurnFlags,
    setMicMode,
  ]);

  const wakeArmed = shouldArmWake({
    mode,
    recording: input.voice.recording,
    transcribing: input.voice.transcribing,
    streaming: input.streaming,
    speaking: input.speaking,
  });

  const startManual = useCallback(() => {
    if (
      !shouldBeginListening({
        source: "manual",
        phraseMatched: false,
      })
    ) {
      return;
    }
    resetTurnFlags();
    pauseWake();
    setMicMode("command");
    void startCapture();
  }, [pauseWake, resetTurnFlags, setMicMode, startCapture]);

  const stopManual = useCallback(() => {
    void input.voice.stop();
  }, [input.voice]);

  return {
    mode,
    wakeArmed,
    onWake,
    handleUtterance,
    startManual,
    stopManual,
    cancelCapture,
  };
}
