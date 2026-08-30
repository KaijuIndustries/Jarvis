/**
 * Server clock for chat. Used when the user asks about date or time.
 *
 * Civil time comes from Date local getters (the Node process timezone).
 * Do not format with toISOString / getUTC* or pass timeZone: "UTC" to Intl —
 * that presents UTC as if it were local and is one hour behind during BST.
 */
const NEEDS_SERVER_TIME =
  /\b(what(?:'s|s| is)? the (?:date|time|day)|what (?:date|time|day)|what day is it|date(?: and time)? is it|time is it|time it is|tell me the (?:date|time)|current (?:date|time|day)|today'?s date|day of the week|what(?:'s|s)? today|timezone|utc offset)\b/i;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function queryNeedsServerTime(text: string): boolean {
  return NEEDS_SERVER_TIME.test(text.trim());
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** UTC±HH:MM from the same local Date fields — not a manual hour adjustment. */
function localUtcOffset(now: Date): string {
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return `UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

function localZoneName(now: Date): string {
  const name = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    timeZoneName: "long",
  })
    .formatToParts(now)
    .find((part) => part.type === "timeZoneName")?.value;
  return name && name !== "UTC" && name !== "Coordinated Universal Time"
    ? name
    : "server local time";
}

export function formatLocalCivilTime(now: Date): string {
  return [
    WEEKDAYS[now.getDay()],
    `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
    `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`,
  ].join(", ");
}

export function formatServerDateTime(now = new Date()): string {
  const civil = formatLocalCivilTime(now);
  const zone = localZoneName(now);
  const offset = localUtcOffset(now);

  return [
    "Trusted server clock. This is already the Jarvis host's local civil time. Use these numbers as-is. Do not treat them as UTC or ISO, and do not convert the timezone.",
    "",
    `Current server local date and time: ${civil} (${zone}, ${offset}).`,
  ].join("\n");
}
