import type { ContextItem } from "./types";

export function formatContextForPrompt(items: ContextItem[]): string | null {
  if (items.length === 0) return null;

  const lines = items.map((item) => {
    const label = item.key.replaceAll("_", " ");
    return `- ${item.category} / ${label}: ${item.value}`;
  });

  return [
    "Trusted persistent context. Treat this as confirmed user/assistant facts. Use it when relevant. Do not mention this block unless asked.",
    "",
    "Persistent context:",
    ...lines,
  ].join("\n");
}
