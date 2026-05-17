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
        className="inline-flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-300 hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
      >
        Export everything
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
