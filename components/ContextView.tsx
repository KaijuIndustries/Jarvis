"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createContextItem,
  deleteContextItem,
  fetchContextItems,
  updateContextItem,
  type ContextCategory,
  type ContextItem,
} from "@/lib/client/api";

const CATEGORIES: { id: ContextCategory; label: string }[] = [
  { id: "user", label: "User" },
  { id: "assistant", label: "Assistant" },
  { id: "preference", label: "Preference" },
  { id: "other", label: "Other" },
];

const emptyForm = {
  key: "",
  value: "",
  category: "preference" as ContextCategory,
};

export function ContextView() {
  const [items, setItems] = useState<ContextItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchContextItems()
      .then((next) => {
        if (!cancelled) setItems(next);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Failed to load context");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    return CATEGORIES.map((category) => ({
      ...category,
      items: items.filter((item) => item.category === category.id),
    })).filter((group) => group.items.length > 0);
  }, [items]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        const updated = await updateContextItem(editingId, form);
        setItems((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
        setEditingId(null);
      } else {
        const created = await createContextItem(form);
        setItems((current) =>
          [...current, created].sort((a, b) =>
            `${a.category}:${a.key}`.localeCompare(`${b.category}:${b.key}`),
          ),
        );
      }
      setForm(emptyForm);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await deleteContextItem(id);
      setItems((current) => current.filter((item) => item.id !== id));
      if (editingId === id) {
        setEditingId(null);
        setForm(emptyForm);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <h1 className="text-lg font-medium tracking-tight">Context</h1>
        <p className="mt-1 text-sm leading-6 text-muted">
          Persistent facts Jarvis can use later. Each item is stored separately.
        </p>

        <form
          className="mt-5 space-y-3 rounded-xl border border-border bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[13px]">
              <span className="text-muted">Name / key</span>
              <input
                value={form.key}
                onChange={(event) =>
                  setForm((current) => ({ ...current, key: event.target.value }))
                }
                placeholder="favourite_colour"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-muted/60"
              />
            </label>
            <label className="block text-[13px]">
              <span className="text-muted">Category</span>
              <select
                value={form.category}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    category: event.target.value as ContextCategory,
                  }))
                }
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-muted/60"
              >
                {CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-[13px]">
            <span className="text-muted">Value</span>
            <textarea
              value={form.value}
              onChange={(event) =>
                setForm((current) => ({ ...current, value: event.target.value }))
              }
              placeholder="Blue"
              rows={3}
              className="mt-1 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-muted/60"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy || !form.key.trim() || !form.value.trim()}
              className="rounded-md bg-accent px-3 py-1.5 text-[13px] text-background disabled:opacity-40"
            >
              {editingId ? "Save changes" : "Add"}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                }}
                className="rounded-md border border-border px-3 py-1.5 text-[13px] text-muted hover:text-foreground"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>

        {error ? <p className="mt-3 text-[13px] text-err">{error}</p> : null}

        <div className="mt-8 space-y-6">
          {grouped.length === 0 ? (
            <p className="text-sm text-muted">No context stored yet.</p>
          ) : (
            grouped.map((group) => (
              <section key={group.id}>
                <h2 className="mb-2 text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
                  {group.label}
                </h2>
                <ul className="space-y-2">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-lg border border-border bg-surface px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium">
                            {item.key.replaceAll("_", " ")}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-6 text-muted">
                            {item.value}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            className="rounded px-2 py-1 text-[12px] text-muted hover:bg-surface-2 hover:text-foreground"
                            onClick={() => {
                              setEditingId(item.id);
                              setForm({
                                key: item.key,
                                value: item.value,
                                category: item.category,
                              });
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="rounded px-2 py-1 text-[12px] text-muted hover:bg-surface-2 hover:text-err"
                            onClick={() => void remove(item.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
