const CLOSING_PHRASES = [
  "i do not need any more help",
  "i dont need any more help",
  "you have answered my question",
  "youve answered my question",
  "you answered my question",
  "no more questions",
  "that is everything",
  "thats everything",
  "that will be all",
  "thatll be all",
  "that is all",
  "thats all",
  "that is it",
  "thats it",
  "i am done",
  "im done",
  "i am finished",
  "im finished",
  "all done",
  "nothing else",
  "no more help",
  "thank you friday",
  "thanks friday",
  "thank you",
  "thanks",
].sort((left, right) => right.length - left.length);

const REMAINDER_FILLERS = new Set([
  "all",
  "alright",
  "friday",
  "hey",
  "nah",
  "no",
  "nope",
  "now",
  "oh",
  "ok",
  "okay",
  "please",
  "right",
  "so",
  "then",
  "uh",
  "um",
  "well",
  "yeah",
  "yep",
  "yes",
]);

function normalizeTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/['\u2018\u2019]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripPhrase(haystack: string, phrase: string): string {
  const pattern = new RegExp(`(?:^|\\s)${escapeRegExp(phrase)}(?=\\s|$)`);
  if (!pattern.test(haystack)) return haystack;
  return haystack.replace(pattern, " ").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when a Whisper transcript is a clear end-of-conversation cue.
 * Conservative: leftover questions or new requests stay conversational.
 */
export function isConversationClosingPhrase(transcript: string): boolean {
  const raw = transcript.trim();
  if (!raw) return false;
  if (raw.includes("?")) return false;

  let remaining = normalizeTranscript(raw);
  if (!remaining) return false;

  let removed = false;
  let changed = true;
  while (changed) {
    changed = false;
    for (const phrase of CLOSING_PHRASES) {
      const next = stripPhrase(remaining, phrase);
      if (next !== remaining) {
        remaining = next;
        removed = true;
        changed = true;
        break;
      }
    }
  }

  if (!removed) return false;
  if (!remaining) return true;
  return remaining.split(" ").every((word) => REMAINDER_FILLERS.has(word));
}

/** Follow-up is armed only for non-empty transcripts that are still conversational. */
export function shouldExpectFollowup(transcript: string): boolean {
  const trimmed = transcript.trim();
  if (!trimmed) return false;
  return !isConversationClosingPhrase(trimmed);
}
