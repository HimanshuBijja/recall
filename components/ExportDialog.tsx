"use client";

import { useEffect, useMemo, useRef } from "react";
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    closeBtnRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      toast("success", "JSON copied to clipboard");
      onClose();
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-lg rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl">
        <div className="p-5 space-y-2 border-b border-zinc-200 dark:border-zinc-800">
          <h2 id="export-dialog-title" className="text-lg font-semibold">{title}</h2>
          {description && <p className="text-sm text-zinc-500">{description}</p>}
          <p className="text-xs font-mono text-zinc-500">
            {sizeLabel}
            {tooLarge && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">
                large payload — save to file recommended
              </span>
            )}
          </p>
        </div>

        <div className="p-5">
          <pre className="rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3 text-[11px] font-mono leading-relaxed overflow-auto max-h-56 text-zinc-700 dark:text-zinc-300">
{json.length > 4000 ? json.slice(0, 4000) + "\n…" : json}
          </pre>
        </div>

        <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
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
            className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Copy JSON
          </button>
          <button
            onClick={save}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
          >
            Save .json
          </button>
        </div>
      </div>
    </div>
  );
}
