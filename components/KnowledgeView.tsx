"use client";

import { useEffect, useRef, useState } from "react";
import {
  deleteDocument,
  fetchDocuments,
  uploadDocument,
  type KnowledgeDocument,
} from "@/lib/client/api";
import { formatBytes } from "@/lib/format";

export function KnowledgeView() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchDocuments()
      .then((next) => {
        if (!cancelled) setDocuments(next);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : "Failed to load documents",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded: KnowledgeDocument[] = [];
      for (const file of Array.from(fileList)) {
        uploaded.push(await uploadDocument(file));
      }
      setDocuments((current) => [...uploaded, ...current]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(id: string, filename: string) {
    if (!window.confirm(`Delete ${filename}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteDocument(id);
      setDocuments((current) => current.filter((item) => item.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <h1 className="text-lg font-medium tracking-tight">Knowledge</h1>
        <p className="mt-1 text-sm leading-6 text-muted">
          Store documents for a later RAG pipeline. Files are saved on this
          server; embeddings are not generated yet.
        </p>

        <div className="mt-5 rounded-xl border border-border bg-surface p-4">
          <p className="text-[13px] font-medium">Upload documents</p>
          <p className="mt-1 text-[12px] text-muted">
            Supported: PDF, images, text, Markdown, and DOCX. 20 MB maximum.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="mt-3 rounded-md border border-border px-3 py-1.5 text-[13px] hover:bg-surface-2 disabled:opacity-40"
          >
            Choose files
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.docx,application/pdf,text/plain,text/markdown,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(event) => void onFiles(event.target.files)}
          />
        </div>

        {error ? <p className="mt-3 text-[13px] text-err">{error}</p> : null}

        <ul className="mt-8 space-y-2">
          {documents.length === 0 ? (
            <p className="text-sm text-muted">No documents uploaded yet.</p>
          ) : (
            documents.map((document) => (
              <li
                key={document.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">
                    {document.filename}
                  </p>
                  <p className="mt-1 text-[12px] text-muted">
                    {[
                      typeLabel(document.mimeType),
                      formatBytes(document.sizeBytes) ?? `${document.sizeBytes} B`,
                      document.status,
                      new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(document.createdAt)),
                    ].join(" · ")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded px-2 py-1 text-[12px] text-muted hover:bg-surface-2 hover:text-err disabled:opacity-40"
                  onClick={() => void remove(document.id, document.filename)}
                >
                  Delete
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function typeLabel(mimeType: string): string {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === "text/plain") return "TXT";
  if (mimeType === "text/markdown") return "Markdown";
  if (mimeType === "image/png") return "PNG";
  if (mimeType === "image/jpeg") return "JPEG";
  if (mimeType.includes("wordprocessingml")) return "DOCX";
  return mimeType;
}
