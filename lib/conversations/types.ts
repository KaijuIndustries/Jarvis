import type { ChatRole } from "@/lib/ai";

export type ConversationMessage = {
  id: string;
  role: Exclude<ChatRole, "system">;
  content: string;
  createdAt: number;
  error?: string;
};

export type Conversation = {
  id: string;
  title: string;
  model: string;
  messages: ConversationMessage[];
  createdAt: number;
  updatedAt: number;
};

export const CONVERSATION_STORAGE_KEY = "jarvis.conversations.v1";
export const SELECTED_MODEL_STORAGE_KEY = "jarvis.selectedModel.v1";
export const SIDEBAR_COLLAPSED_STORAGE_KEY = "jarvis.sidebarCollapsed.v1";
