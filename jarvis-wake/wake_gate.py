"""Wake confirmation and cooldown, independent of openWakeWord."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class WakeDecision:
    woke: bool
    streak: int
    score: float


class WakeGate:
    """Requires several consecutive above-threshold frames before a wake.

    One isolated spike cannot wake. After a wake, cooldown suppresses
    duplicates from the same utterance.
    """

    def __init__(
        self,
        threshold: float,
        confirm_frames: int,
        cooldown_seconds: float,
    ) -> None:
        if threshold < 0:
            raise ValueError("threshold must be >= 0")
        if confirm_frames < 1:
            raise ValueError("confirm_frames must be >= 1")
        if cooldown_seconds < 0:
            raise ValueError("cooldown_seconds must be >= 0")
        self.threshold = threshold
        self.confirm_frames = confirm_frames
        self.cooldown_seconds = cooldown_seconds
        self.streak = 0
        self.last_wake: float | None = None

    def reset_streak(self) -> None:
        self.streak = 0

    def observe(self, score: float, now: float) -> WakeDecision:
        if score < self.threshold:
            self.streak = 0
            return WakeDecision(woke=False, streak=self.streak, score=score)

        self.streak += 1
        if self.streak < self.confirm_frames:
            return WakeDecision(woke=False, streak=self.streak, score=score)

        if self.last_wake is not None and now - self.last_wake < self.cooldown_seconds:
            self.streak = 0
            return WakeDecision(woke=False, streak=0, score=score)

        self.last_wake = now
        self.streak = 0
        return WakeDecision(woke=True, streak=0, score=score)


def friday_score(scores: dict) -> float:
    best = 0.0
    for name, value in scores.items():
        if "friday" not in str(name).lower():
            continue
        try:
            if hasattr(value, "__len__") and not isinstance(value, (str, bytes)):
                score = float(max(value))
            else:
                score = float(value)
        except (TypeError, ValueError):
            continue
        if score > best:
            best = score
    return best


def vad_gated_score(score: float, speech: bool) -> float:
    """openWakeWord zeros wake scores when Silero VAD does not see speech."""
    return score if speech else 0.0


def should_reset_continuous_session(
    last_reset: float,
    now: float,
    *,
    interval: float,
    streak: int,
) -> bool:
    """Reset the detector after a long stream so scores cannot drift into a wake."""
    if streak > 0:
        return False
    return now - last_reset >= interval
