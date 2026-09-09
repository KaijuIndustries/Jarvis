"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ORB_COMMAND_PREROLL_MS,
  ORB_COMMAND_SILENCE_MS,
  ORB_COMMAND_WAIT_MS,
  ORB_FOLLOWUP_MS,
  shouldArmWake,
  shouldStartFollowup,
  type OrbMicMode,
} from "@/lib/voice/orb-turn";
import { shouldExpectFollowup } from "@/lib/voice/closing-phrase";
import type { useVoiceCapture } from "./useVoiceCapture";

type Voice = ReturnType<typeof useVoiceCapture>;

/**
 * Hands-free orb turn: wake → command capture → follow-up, without
 * treating the wake phrase itself as a chat message.
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
  const expectFollowupRef = useRef(false);
  const closeAfterTurnRef = useRef(false);
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

  const beginCommand = useCallback(
    (waitForSpeechMs: number) => {
      if (input.voice.recording || input.voice.transcribing || input.streaming || input.speaking) {
        return;
      }
      pauseWake();
      consumedRef.current = false;
      expectFollowupRef.current = false;
      closeAfterTurnRef.current = false;
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
      setMicMode,
      startCapture,
    ],
  );

  const onWake = useCallback(() => {
    if (modeRef.current !== "passive") return;
    beginCommand(ORB_COMMAND_WAIT_MS);
  }, [beginCommand]);

  const beginFollowup = useCallback(() => {
    if (input.voice.recording || input.voice.transcribing || input.streaming || input.speaking) {
      return;
    }
    pauseWake();
    consumedRef.current = false;
    setMicMode("followup");
    void startCapture({
      autoStop: true,
      waitForSpeechMs: ORB_FOLLOWUP_MS,
      prerollMs: 120,
      silenceMs: ORB_COMMAND_SILENCE_MS,
    }).then((started) => {
      if (!started) setMicMode("passive");
    });
  }, [
    input.speaking,
    input.streaming,
    input.voice.recording,
    input.voice.transcribing,
    pauseWake,
    setMicMode,
    startCapture,
  ]);

  const handleUtterance = useCallback(
    (text: string | null) => {
      const trimmed = text?.trim() ?? "";
      if (trimmed) {
        if (consumedRef.current) return;
        consumedRef.current = true;
        const wantsFollowup = shouldExpectFollowup(trimmed);
        expectFollowupRef.current = wantsFollowup;
        closeAfterTurnRef.current = !wantsFollowup;
        sawBusyRef.current = false;
        void sendMessage(trimmed).catch(() => {
          expectFollowupRef.current = false;
          closeAfterTurnRef.current = false;
          sawBusyRef.current = false;
          setMicMode("passive");
        });
        return;
      }

      expectFollowupRef.current = false;
      closeAfterTurnRef.current = false;
      sawBusyRef.current = false;
      setMicMode("passive");
    },
    [sendMessage, setMicMode],
  );

  useEffect(() => {
    if (input.streaming || input.speaking) {
      if (expectFollowupRef.current || closeAfterTurnRef.current) {
        sawBusyRef.current = true;
      }
      return;
    }
    if (
      shouldStartFollowup({
        pendingFollowup: expectFollowupRef.current && sawBusyRef.current,
        streaming: input.streaming,
        speaking: input.speaking,
        recording: input.voice.recording,
        transcribing: input.voice.transcribing,
      })
    ) {
      expectFollowupRef.current = false;
      closeAfterTurnRef.current = false;
      sawBusyRef.current = false;
      const timer = window.setTimeout(() => beginFollowup(), 0);
      return () => window.clearTimeout(timer);
    }
    if (
      closeAfterTurnRef.current &&
      sawBusyRef.current &&
      !input.voice.recording &&
      !input.voice.transcribing
    ) {
      closeAfterTurnRef.current = false;
      sawBusyRef.current = false;
      const timer = window.setTimeout(() => setMicMode("passive"), 0);
      return () => window.clearTimeout(timer);
    }
  }, [
    beginFollowup,
    input.speaking,
    input.streaming,
    input.voice.recording,
    input.voice.transcribing,
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
    expectFollowupRef.current = false;
    closeAfterTurnRef.current = false;
    sawBusyRef.current = false;
    consumedRef.current = false;
    pauseWake();
    setMicMode("command");
    void startCapture();
  }, [pauseWake, setMicMode, startCapture]);

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
