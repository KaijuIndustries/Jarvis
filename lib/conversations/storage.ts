import {
  CONVERSATION_STORAGE_KEY,
  SELECTED_MODEL_STORAGE_KEY,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  type Conversation,
} from "./types";

/**
 * Conversation persistence for v1.
 *
 * localStorage keeps the first version free of a database. Swap this module
 * for a server/repository implementation later without changing UI types.
 */
export function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CONVERSATION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isConversation);
  } catch {
    return [];
  }
}

export function saveConversations(conversations: Conversation[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    CONVERSATION_STORAGE_KEY,
    JSON.stringify(conversations),
  );
}

export function loadSelectedModel(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SELECTED_MODEL_STORAGE_KEY);
}

export function saveSelectedModel(modelId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, modelId);
}

export function loadSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    SIDEBAR_COLLAPSED_STORAGE_KEY,
    collapsed ? "1" : "0",
  );
}

function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Conversation>;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.model === "string" &&
    Array.isArray(item.messages)
  );
}
