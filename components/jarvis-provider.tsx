"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { fetchHealth, fetchModels, streamChat } from "@/lib/client/api";
import type { ChatMessage, ModelInfo, ProviderHealth } from "@/lib/ai";
import type { Conversation, ConversationMessage } from "@/lib/conversations/types";
import {
  getSessionServerSnapshot,
  getSessionSnapshot,
  patchConversation,
  setSessionActiveId,
  setSessionConversations,
  setSessionSelectedModel,
  setSessionSidebarCollapsed,
  subscribeSession,
} from "@/lib/conversations/session";
import { createId, titleFromPrompt } from "@/lib/format";

type JarvisContextValue = {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  models: ModelInfo[];
  selectedModel: string | null;
  health: ProviderHealth;
  checkingHealth: boolean;
  streaming: boolean;
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  newConversation: () => void;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  selectModel: (id: string) => void;
  sendMessage: (content: string) => Promise<void>;
  stop: () => void;
  regenerate: () => Promise<void>;
  refreshModels: () => Promise<void>;
  toggleSidebarCollapsed: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
};

const JarvisContext = createContext<JarvisContextValue | null>(null);

function toProviderMessages(messages: ConversationMessage[]): ChatMessage[] {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

function createConversation(model: string): Conversation {
  const now = Date.now();
  return {
    id: createId(),
    title: "New conversation",
    model,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function JarvisProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getSessionServerSnapshot,
  );
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [health, setHealth] = useState<ProviderHealth>({ ok: false });
  const [checkingHealth, setCheckingHealth] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refreshModels = useCallback(async () => {
    const result = await fetchModels();
    setModels(result.models);
    const current = getSessionSnapshot().selectedModel;
    if (current && result.models.some((model) => model.id === current)) {
      return;
    }
    const fallback = result.models[0]?.id ?? null;
    setSessionSelectedModel(fallback);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const tickHealth = () => {
      void fetchHealth().then((next) => {
        if (cancelled) return;
        setHealth(next);
        setCheckingHealth(false);
      });
    };

    const tickModels = () => {
      void fetchModels().then((result) => {
        if (cancelled) return;
        setModels(result.models);
        const current = getSessionSnapshot().selectedModel;
        if (current && result.models.some((model) => model.id === current)) {
          return;
        }
        setSessionSelectedModel(result.models[0]?.id ?? null);
      });
    };

    tickHealth();
    tickModels();
    const healthTimer = window.setInterval(tickHealth, 10_000);
    const modelTimer = window.setInterval(tickModels, 30_000);

    function onFocus() {
      tickHealth();
      tickModels();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(healthTimer);
      window.clearInterval(modelTimer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const activeConversation =
    session.conversations.find(
      (conversation) => conversation.id === session.activeId,
    ) ?? null;

  const selectModel = useCallback((id: string) => {
    setSessionSelectedModel(id);
  }, []);

  const newConversation = useCallback(() => {
    const current = getSessionSnapshot();
    const blank = current.conversations.find(
      (conversation) => conversation.messages.length === 0,
    );
    if (blank) {
      setSessionActiveId(blank.id);
      setMobileSidebarOpen(false);
      return;
    }
    const created = createConversation(current.selectedModel ?? "");
    setSessionConversations([created, ...current.conversations]);
    setSessionActiveId(created.id);
    setMobileSidebarOpen(false);
  }, []);

  const selectConversation = useCallback((id: string) => {
    const current = getSessionSnapshot();
    const conversation = current.conversations.find((item) => item.id === id);
    setSessionActiveId(id);
    setMobileSidebarOpen(false);
    if (
      conversation?.model &&
      models.some((model) => model.id === conversation.model)
    ) {
      setSessionSelectedModel(conversation.model);
    }
  }, [models]);

  const deleteConversation = useCallback((id: string) => {
    const current = getSessionSnapshot();
    setSessionConversations(
      current.conversations.filter((conversation) => conversation.id !== id),
    );
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const runGeneration = useCallback(
    async (conversationId: string, history: ConversationMessage[]) => {
      const model = getSessionSnapshot().selectedModel;
      if (!model) {
        throw new Error("Select a model first");
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);

      const assistant: ConversationMessage = {
        id: createId(),
        role: "assistant",
        content: "",
        createdAt: Date.now(),
      };

      patchConversation(conversationId, (conversation) => ({
        ...conversation,
        model,
        updatedAt: Date.now(),
        messages: [...history, assistant],
      }));

      try {
        await streamChat({
          model,
          messages: toProviderMessages(history),
          signal: controller.signal,
          onChunk: (chunk) => {
            if (!chunk.content) return;
            patchConversation(conversationId, (conversation) => ({
              ...conversation,
              updatedAt: Date.now(),
              messages: conversation.messages.map((message) =>
                message.id === assistant.id
                  ? { ...message, content: message.content + chunk.content }
                  : message,
              ),
            }));
          },
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Generation failed";
        patchConversation(conversationId, (conversation) => ({
          ...conversation,
          messages: conversation.messages.map((item) =>
            item.id === assistant.id ? { ...item, error: message } : item,
          ),
        }));
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setStreaming(false);
        }
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!text || streaming) return;

      const current = getSessionSnapshot();
      let conversation =
        current.conversations.find((item) => item.id === current.activeId) ??
        null;

      if (!conversation) {
        conversation = createConversation(current.selectedModel ?? "");
        setSessionConversations([conversation, ...current.conversations]);
        setSessionActiveId(conversation.id);
      }

      const userMessage: ConversationMessage = {
        id: createId(),
        role: "user",
        content: text,
        createdAt: Date.now(),
      };
      const history = [...conversation.messages, userMessage];
      const title =
        conversation.messages.length === 0
          ? titleFromPrompt(text)
          : conversation.title;

      patchConversation(conversation.id, (item) => ({
        ...item,
        title,
        updatedAt: Date.now(),
        messages: history,
      }));

      await runGeneration(conversation.id, history);
    },
    [runGeneration, streaming],
  );

  const regenerate = useCallback(async () => {
    const current = getSessionSnapshot();
    const conversation = current.conversations.find(
      (item) => item.id === current.activeId,
    );
    if (!conversation) return;
    const lastUserIndex = [...conversation.messages]
      .map((message, index) => ({ message, index }))
      .reverse()
      .find((item) => item.message.role === "user")?.index;
    if (lastUserIndex == null) return;
    const history = conversation.messages.slice(0, lastUserIndex + 1);
    patchConversation(conversation.id, (item) => ({
      ...item,
      messages: history,
      updatedAt: Date.now(),
    }));
    await runGeneration(conversation.id, history);
  }, [runGeneration]);

  const toggleSidebarCollapsed = useCallback(() => {
    setSessionSidebarCollapsed(!getSessionSnapshot().sidebarCollapsed);
  }, []);

  const value = useMemo<JarvisContextValue>(
    () => ({
      conversations: session.conversations,
      activeConversation,
      models,
      selectedModel: session.selectedModel,
      health,
      checkingHealth,
      streaming,
      sidebarCollapsed: session.sidebarCollapsed,
      mobileSidebarOpen,
      newConversation,
      selectConversation,
      deleteConversation,
      selectModel,
      sendMessage,
      stop,
      regenerate,
      refreshModels,
      toggleSidebarCollapsed,
      setMobileSidebarOpen,
    }),
    [
      session.conversations,
      session.selectedModel,
      session.sidebarCollapsed,
      activeConversation,
      models,
      health,
      checkingHealth,
      streaming,
      mobileSidebarOpen,
      newConversation,
      selectConversation,
      deleteConversation,
      selectModel,
      sendMessage,
      stop,
      regenerate,
      refreshModels,
      toggleSidebarCollapsed,
    ],
  );

  return <JarvisContext.Provider value={value}>{children}</JarvisContext.Provider>;
}

export function useJarvis(): JarvisContextValue {
  const value = useContext(JarvisContext);
  if (!value) {
    throw new Error("useJarvis must be used within JarvisProvider");
  }
  return value;
}
