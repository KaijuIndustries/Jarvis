import {
  loadConversations,
  loadSelectedModel,
  loadSidebarCollapsed,
  saveConversations,
  saveSelectedModel,
  saveSidebarCollapsed,
} from "./storage";
import type { Conversation } from "./types";

export type PersistedSession = {
  conversations: Conversation[];
  selectedModel: string | null;
  sidebarCollapsed: boolean;
  activeId: string | null;
};

const ACTIVE_ID_STORAGE_KEY = "jarvis.activeConversation.v1";

const listeners = new Set<() => void>();

const emptySession: PersistedSession = {
  conversations: [],
  selectedModel: null,
  sidebarCollapsed: false,
  activeId: null,
};

let session: PersistedSession = emptySession;
let didHydrate = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function loadActiveId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_ID_STORAGE_KEY);
}

function saveActiveId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(ACTIVE_ID_STORAGE_KEY, id);
  else window.localStorage.removeItem(ACTIVE_ID_STORAGE_KEY);
}

function hydrate() {
  if (didHydrate || typeof window === "undefined") return;
  const conversations = loadConversations();
  const storedActive = loadActiveId();
  session = {
    conversations,
    selectedModel: loadSelectedModel(),
    sidebarCollapsed: loadSidebarCollapsed(),
    activeId:
      conversations.find((conversation) => conversation.id === storedActive)?.id ??
      conversations[0]?.id ??
      null,
  };
  didHydrate = true;
}

export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSessionSnapshot(): PersistedSession {
  hydrate();
  return session;
}

export function getSessionServerSnapshot(): PersistedSession {
  return emptySession;
}

export function setSessionConversations(conversations: Conversation[]) {
  const activeId =
    conversations.find((conversation) => conversation.id === session.activeId)?.id ??
    conversations[0]?.id ??
    null;
  session = { ...session, conversations, activeId };
  saveConversations(conversations);
  saveActiveId(activeId);
  emit();
}

export function setSessionActiveId(activeId: string | null) {
  session = { ...session, activeId };
  saveActiveId(activeId);
  emit();
}

export function setSessionSelectedModel(selectedModel: string | null) {
  session = { ...session, selectedModel };
  if (selectedModel) saveSelectedModel(selectedModel);
  emit();
}

export function setSessionSidebarCollapsed(sidebarCollapsed: boolean) {
  session = { ...session, sidebarCollapsed };
  saveSidebarCollapsed(sidebarCollapsed);
  emit();
}

export function patchConversation(
  conversationId: string,
  updater: (conversation: Conversation) => Conversation,
) {
  setSessionConversations(
    session.conversations.map((conversation) =>
      conversation.id === conversationId ? updater(conversation) : conversation,
    ),
  );
}
