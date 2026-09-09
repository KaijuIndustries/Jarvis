import unittest

from wake_gate import WakeGate, friday_score, vad_gated_score


class WakeGateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.gate = WakeGate(threshold=0.5, confirm_frames=2, cooldown_seconds=3)

    def test_score_below_threshold_does_not_wake(self) -> None:
        decision = self.gate.observe(0.49, now=1.0)
        self.assertFalse(decision.woke)
        self.assertEqual(decision.streak, 0)

    def test_sustained_scores_wake(self) -> None:
        first = self.gate.observe(0.61, now=1.0)
        second = self.gate.observe(0.73, now=1.08)
        self.assertFalse(first.woke)
        self.assertTrue(second.woke)
        self.assertEqual(second.score, 0.73)

    def test_isolated_spike_does_not_wake(self) -> None:
        spike = self.gate.observe(0.99, now=1.0)
        quiet = self.gate.observe(0.1, now=1.08)
        again = self.gate.observe(0.2, now=1.16)
        self.assertFalse(spike.woke)
        self.assertFalse(quiet.woke)
        self.assertFalse(again.woke)

    def test_threshold_configuration_is_respected(self) -> None:
        strict = WakeGate(threshold=0.8, confirm_frames=1, cooldown_seconds=0)
        self.assertFalse(strict.observe(0.79, now=1.0).woke)
        self.assertTrue(strict.observe(0.8, now=1.1).woke)

    def test_session_reset_clears_partial_confirmation(self) -> None:
        self.gate.observe(0.9, now=1.0)
        self.gate.reset_streak()
        after_reset = self.gate.observe(0.9, now=1.1)
        self.assertFalse(after_reset.woke)
        confirmed = self.gate.observe(0.9, now=1.2)
        self.assertTrue(confirmed.woke)

    def test_vad_rejects_non_speech_even_with_high_raw_score(self) -> None:
        gated = vad_gated_score(0.95, speech=False)
        decision = self.gate.observe(gated, now=1.0)
        self.assertEqual(gated, 0.0)
        self.assertFalse(decision.woke)

    def test_vad_allows_speech_plus_wake_scores(self) -> None:
        first = self.gate.observe(vad_gated_score(0.62, speech=True), now=1.0)
        second = self.gate.observe(vad_gated_score(0.71, speech=True), now=1.08)
        self.assertFalse(first.woke)
        self.assertTrue(second.woke)

    def test_one_utterance_does_not_emit_duplicate_wakes(self) -> None:
        self.assertFalse(self.gate.observe(0.7, now=1.0).woke)
        self.assertTrue(self.gate.observe(0.8, now=1.08).woke)
        self.assertFalse(self.gate.observe(0.85, now=1.16).woke)
        self.assertFalse(self.gate.observe(0.9, now=2.0).woke)
        self.assertFalse(self.gate.observe(0.7, now=4.2).woke)
        self.assertTrue(self.gate.observe(0.75, now=4.28).woke)

    def test_friday_score_ignores_other_models(self) -> None:
        self.assertEqual(friday_score({"hey_jarvis": 0.99, "noise": 1.0}), 0.0)
        self.assertAlmostEqual(friday_score({"hey_friday": 0.73}), 0.73)


if __name__ == "__main__":
    unittest.main()
