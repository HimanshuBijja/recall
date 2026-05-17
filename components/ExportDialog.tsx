"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";

const LARGE_PAYLOAD_BYTES = 200_000;

interface Props {
  open: boolean;
  title: string;
  description?: string;
  filename: string;
  payload: unknown;
  onClose: () => void;
}

export function ExportDialog({ open, title, description, filename, payload, onClose }: Props) {
  const toast = useToast();
  const json = useMemo(() => (open ? JSON.stringify(payload, null, 2) : ""), [open, payload]);
  const bytes = json.length;
  const tooLarge = bytes > LARGE_PAYLOAD_BYTES;
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [justCopied, setJustCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setJustCopied(true);
      toast("success", "JSON copied to clipboard");
      setTimeout(() => setJustCopied(false), 1400);
    } catch {
      toast("error", "Couldn't copy — your browser blocked clipboard access");
    }
  }

  function save() {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".json") ? filename : `${filename}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("success", "File saved");
    onClose();
  }

  const sizeLabel =
    bytes < 1024 ? `${bytes} B`
    : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-[fadeIn_120ms_ease-out]"
    >
      <div
        className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden animate-[slideUp_180ms_cubic-bezier(0.16,1,0.3,1)]">
        <div className="p-5 sm:p-6 flex items-start gap-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="shrink-0 w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <DownloadIcon />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="export-dialog-title" className="text-base sm:text-lg font-semibold leading-tight">
              {title}
            </h2>
            {description && (
              <p className="text-sm text-zinc-500 mt-1 leading-snug">{description}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-mono">
              <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                {sizeLabel}
              </span>
              {tooLarge && (
                <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900">
                  large — save to file recommended
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 -mt-1 -mr-1 w-8 h-8 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="px-5 sm:px-6 pt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Preview
            </span>
            <span className="text-[10px] font-mono text-zinc-400">
              {json.length > 4000 ? "first 4 KB shown" : "full payload"}
            </span>
          </div>
          <pre className="rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3 text-[11px] font-mono leading-relaxed overflow-auto max-h-56 text-zinc-700 dark:text-zinc-300">
{json.length > 4000 ? json.slice(0, 4000) + "\n…" : json}
          </pre>
        </div>

        <div className="px-5 sm:px-6 py-4 mt-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center gap-2 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
          <span className="hidden sm:inline text-[11px] text-zinc-400 font-mono">
            Esc to close
          </span>
          <div className="flex flex-col-reverse sm:flex-row sm:ml-auto gap-2 w-full sm:w-auto">
            <button
              ref={closeBtnRef}
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              onClick={copy}
              disabled={tooLarge}
              title={tooLarge ? "Payload too large to copy reliably — please save instead" : undefined}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {justCopied ? <CheckIcon /> : <CopyIcon />}
              {justCopied ? "Copied" : "Copy JSON"}
            </button>
            <button
              onClick={save}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
            >
              <DownloadIcon /> Save .json
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px) scale(0.98) }
          to   { opacity: 1; transform: translateY(0) scale(1) }
        }
      `}</style>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
