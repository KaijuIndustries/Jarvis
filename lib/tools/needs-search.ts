/**
 * Conservative heuristic: only search when the user likely wants
 * current internet information. The backend owns this decision.
 */
const NEEDS_SEARCH =
  /\b(latest|current|today|tonight|yesterday|this week|this month|this year|right now|breaking|headline|news|who won|score|weather|forecast|stock price|as of|what happened|look up|search the web|search for|google)\b/i;

export function queryNeedsWebSearch(text: string): boolean {
  const value = text.trim();
  if (value.length < 8) return false;
  return NEEDS_SEARCH.test(value);
}
