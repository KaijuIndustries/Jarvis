/**
 * Turns assistant markdown/math into something Piper can speak.
 * Leaves the on-screen transcript unchanged.
 */
export function prepareSpeechText(text: string): string {
  let value = text.replace(/\s+/g, " ").trim();
  if (!value) return "";

  value = value.replace(/```[\s\S]*?```/g, " ");
  value = value.replace(/`([^`]+)`/g, "$1");
  value = value.replace(/\$\$[\s\S]*?\$\$/g, " ");
  value = value.replace(/\$([^$]+)\$/g, "$1");
  value = value.replace(/\\\(([\s\S]*?)\\\)/g, "$1");
  value = value.replace(/\\\[([\s\S]*?)\\\]/g, "$1");
  value = value.replace(/(\d)\s*\*\s*(\d)/g, "$1 times $2");
  value = value.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  value = value.replace(/[*_~#]+/g, " ");
  value = value.replace(/[|]+/g, " ");
  value = value.replace(/\s+([.,!?])/g, "$1");
  value = value.replace(/\s+/g, " ").trim();
  return value;
}
