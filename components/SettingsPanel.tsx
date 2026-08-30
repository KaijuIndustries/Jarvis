"use client";

import { useEffect, useState } from "react";
import {
  clearOllamaApiKey,
  fetchOllamaSettings,
  saveOllamaApiKey,
  type OllamaSettingsStatus,
} from "@/lib/client/api";

type SettingsPanelProps = {
  onClose: () => void;
};

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [status, setStatus] = useState<OllamaSettingsStatus | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchOllamaSettings()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load settings");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const next = await saveOllamaApiKey(draft);
      setStatus(next);
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setError(null);
    try {
      const next = await clearOllamaApiKey();
      setStatus(next);
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Clear failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh]">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close settings"
        onClick={onClose}
      />
      <section
        className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-panel"
        role="dialog"
        aria-labelledby="settings-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="settings-title" className="text-[15px] font-medium">
              Settings
            </h2>
            <p className="mt-1 text-[12px] text-muted">AI / Ollama</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-[12px] text-muted hover:bg-surface-2 hover:text-foreground"
          >
            Close
          </button>
        </div>

        <label
          htmlFor="ollama-api-key"
          className="block text-[13px] font-medium"
        >
          Ollama API Key
        </label>
        <p className="mt-1 text-[12px] leading-5 text-muted">
          Stored on this Jarvis server. It is sent only to the configured Ollama
          web search service and is never shown again after saving.
        </p>

        <input
          id="ollama-api-key"
          type="password"
          autoComplete="off"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={status?.configured ? "Enter a new key to replace" : "Paste API key"}
          className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-muted/60"
        />

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !draft.trim()}
            className="rounded-md bg-accent px-3 py-1.5 text-[13px] text-background disabled:opacity-40"
          >
            Save
          </button>
          {status?.source === "server" ? (
            <button
              type="button"
              onClick={() => void clear()}
              disabled={busy}
              className="rounded-md border border-border px-3 py-1.5 text-[13px] text-muted hover:text-foreground disabled:opacity-40"
            >
              Clear
            </button>
          ) : null}
        </div>

        <p className="mt-4 text-[12px] text-muted">
          {status?.configured ? (
            <>
              API key configured
              {status.source === "environment"
                ? " via environment variable."
                : " on this server."}
            </>
          ) : (
            "No API key configured."
          )}
        </p>
        {error ? <p className="mt-2 text-[12px] text-err">{error}</p> : null}
      </section>
    </div>
  );
}
