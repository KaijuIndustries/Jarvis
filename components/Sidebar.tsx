"use client";

import type { Conversation } from "@/lib/conversations/types";
import { formatRelativeTime } from "@/lib/format";
import { MarkIcon, PlusIcon, SettingsIcon, SidebarIcon, TrashIcon } from "./icons";

type SidebarProps = {
  conversations: Conversation[];
  activeId: string | null;
  collapsed: boolean;
  mobileOpen: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
  onOpenSettings: () => void;
};

export function Sidebar({
  conversations,
  activeId,
  collapsed,
  mobileOpen,
  onNew,
  onSelect,
  onDelete,
  onToggleCollapsed,
  onCloseMobile,
  onOpenSettings,
}: SidebarProps) {
  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          aria-label="Close sidebar"
          onClick={onCloseMobile}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-dvh w-[272px] flex-col border-r border-border bg-surface transition-[width,transform] duration-200 md:static ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } ${collapsed ? "md:w-16" : "md:w-[272px]"}`}
      >
        <div className="flex h-12 items-center gap-2 px-3">
          <MarkIcon className="h-7 w-7 shrink-0 text-accent" />
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium tracking-wide">
                Jarvis
              </p>
              <p className="truncate text-[11px] text-muted">Local assistant</p>
            </div>
          ) : null}
          <button
            type="button"
            className="hidden rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground md:inline-flex"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <SidebarIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="px-2 pb-2">
          <button
            type="button"
            onClick={onNew}
            className={`flex w-full items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-[13px] text-foreground hover:bg-surface-2 ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            <PlusIcon className="h-4 w-4 shrink-0" />
            {!collapsed ? <span>New conversation</span> : null}
          </button>
        </div>

        {!collapsed ? (
          <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {conversations.length === 0 ? (
              <p className="px-2 py-3 text-[12px] text-muted">
                Conversations stay on this device.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {conversations.map((conversation) => {
                  const active = conversation.id === activeId;
                  return (
                    <li key={conversation.id}>
                      <div
                        className={`group flex items-center rounded-md ${
                          active ? "bg-surface-2" : "hover:bg-surface-2/70"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelect(conversation.id)}
                          className="min-w-0 flex-1 px-2.5 py-2 text-left"
                        >
                          <span className="block truncate text-[13px]">
                            {conversation.title}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-muted">
                            {formatRelativeTime(conversation.updatedAt)}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="mr-1 rounded p-1 text-muted opacity-0 hover:text-err group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
                          aria-label={`Delete ${conversation.title}`}
                          onClick={() => onDelete(conversation.id)}
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>
        ) : (
          <div className="flex-1" />
        )}

        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-muted hover:bg-surface-2 hover:text-foreground ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            <SettingsIcon className="h-4 w-4 shrink-0" />
            {!collapsed ? <span>Settings</span> : null}
          </button>
        </div>
      </aside>
    </>
  );
}
