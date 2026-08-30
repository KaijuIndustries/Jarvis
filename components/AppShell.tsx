"use client";

import { useState } from "react";
import { ChatPane } from "./ChatPane";
import { Composer } from "./Composer";
import { ModelSelector } from "./ModelSelector";
import { SettingsPanel } from "./SettingsPanel";
import { Sidebar } from "./Sidebar";
import { StatusIndicator } from "./StatusIndicator";
import { SidebarIcon } from "./icons";
import { useJarvis } from "./jarvis-provider";

export function AppShell() {
  const jarvis = useJarvis();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Sidebar
        conversations={jarvis.conversations}
        activeId={jarvis.activeConversation?.id ?? null}
        collapsed={jarvis.sidebarCollapsed}
        mobileOpen={jarvis.mobileSidebarOpen}
        onNew={jarvis.newConversation}
        onSelect={jarvis.selectConversation}
        onDelete={jarvis.deleteConversation}
        onToggleCollapsed={jarvis.toggleSidebarCollapsed}
        onCloseMobile={() => jarvis.setMobileSidebarOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-3">
          <button
            type="button"
            className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground md:hidden"
            onClick={() => jarvis.setMobileSidebarOpen(true)}
            aria-label="Open conversations"
          >
            <SidebarIcon className="h-4 w-4" />
          </button>
          <ModelSelector
            models={jarvis.models}
            selectedModel={jarvis.selectedModel}
            disabled={!jarvis.health.ok}
            onSelect={jarvis.selectModel}
            onOpen={() => void jarvis.refreshModels()}
          />
          <div className="ml-auto min-w-0">
            <StatusIndicator
              connected={jarvis.health.ok}
              checking={jarvis.checkingHealth && !jarvis.health.ok}
              selectedModel={jarvis.selectedModel}
            />
          </div>
        </header>

        <ChatPane
          conversation={jarvis.activeConversation}
          streaming={jarvis.streaming}
          ollamaOk={jarvis.health.ok}
          checking={jarvis.checkingHealth}
          hasModels={jarvis.models.length > 0}
          onCopy={(content) => void navigator.clipboard.writeText(content)}
          onRegenerate={() => void jarvis.regenerate()}
        />

        <Composer
          disabled={!jarvis.health.ok || !jarvis.selectedModel}
          streaming={jarvis.streaming}
          placeholder={
            !jarvis.health.ok
              ? "Ollama is unavailable"
              : !jarvis.selectedModel
                ? "Select a model to chat"
                : "Message Jarvis"
          }
          onSend={(value) => void jarvis.sendMessage(value)}
          onStop={jarvis.stop}
        />
      </div>

      {settingsOpen ? (
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      ) : null}
    </div>
  );
}
