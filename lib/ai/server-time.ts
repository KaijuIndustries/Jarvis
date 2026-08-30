/**
 * Server clock for chat. Used when the user asks about date or time.
 * Timezone is the Node process timezone (the host / TZ env).
 */
const NEEDS_SERVER_TIME =
  /\b(what(?:'s|s| is)? the (?:date|time|day)|what (?:date|time|day)|what day is it|date(?: and time)? is it|time is it|time it is|tell me the (?:date|time)|current (?:date|time|day)|today'?s date|day of the week|what(?:'s|s)? today|timezone|utc offset)\b/i;

export function queryNeedsServerTime(text: string): boolean {
  return NEEDS_SERVER_TIME.test(text.trim());
}

export function formatServerDateTime(
  now = new Date(),
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone,
    timeZoneName: "short",
  }).format(now);

  return [
    "Trusted server clock. This is the current date and time on the Jarvis host. Use it for date/time questions. Do not guess the date or time.",
    "",
    `Current server date and time: ${formatted} (${timeZone}).`,
  ].join("\n");
}
