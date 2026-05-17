"use client";

import { useState } from "react";
import { ExportDialog } from "@/components/ExportDialog";
import type { ExportedBundle } from "@/lib/export";

export function ExportAllButton({ bundle }: { bundle: ExportedBundle }) {
  const [open, setOpen] = useState(false);
  const total = bundle.cards.length + bundle.tags.length + bundle.groups.length;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={total === 0}
        className="flex-1 sm:flex-initial inline-flex items-center justify-center px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Export all
      </button>
      <ExportDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Export everything"
        description={`Bundle of ${bundle.cards.length} card${bundle.cards.length === 1 ? "" : "s"}, ${bundle.tags.length} tag${bundle.tags.length === 1 ? "" : "s"}, and ${bundle.groups.length} group${bundle.groups.length === 1 ? "" : "s"}.`}
        filename="recall-export"
        payload={bundle}
      />
    </>
  );
}
