"use client";

import { formatBytes } from "@/lib/format";
import type { ModelInfo } from "@/lib/ai";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronIcon } from "./icons";

type ModelSelectorProps = {
  models: ModelInfo[];
  selectedModel: string | null;
  disabled?: boolean;
  onSelect: (modelId: string) => void;
  onOpen?: () => void;
};

export function ModelSelector({
  models,
  selectedModel,
  disabled,
  onSelect,
  onOpen,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = models.find((model) => model.id === selectedModel);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function toggle() {
    if (disabled) return;
    const next = !open;
    setOpen(next);
    if (next) onOpen?.();
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        className="flex max-w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-left text-[13px] text-foreground transition-colors hover:border-muted/40 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 truncate font-medium">
          {selected?.name ?? (models.length === 0 ? "No models" : "Select model")}
        </span>
        {selected?.parameterSize ? (
          <span className="hidden shrink-0 text-muted sm:inline">
            {selected.parameterSize}
          </span>
        ) : null}
        <ChevronIcon className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 z-30 mt-1.5 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-surface shadow-panel"
        >
          <div className="max-h-72 overflow-y-auto py-1">
            {models.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted">
                No Ollama models found. Pull a model to get started.
              </p>
            ) : (
              models.map((model) => {
                const active = model.id === selectedModel;
                const size = formatBytes(model.sizeBytes);
                return (
                  <button
                    key={model.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-surface-2"
                    onClick={() => {
                      onSelect(model.id);
                      setOpen(false);
                    }}
                  >
                    <span className="mt-0.5 w-4 shrink-0 text-accent">
                      {active ? <CheckIcon className="h-3.5 w-3.5" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">
                        {model.name}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted">
                        {[model.parameterSize, model.quantization, size]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
