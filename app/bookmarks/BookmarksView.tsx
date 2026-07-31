"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Card, Tag } from "@/types";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { exportCard, exportCards } from "@/lib/export";
import { ExportDialog } from "@/components/ExportDialog";
import { CardKindBadge } from "@/components/CardKindBadge";

export function BookmarksView({ initialCards, tags }: { initialCards: Card[]; tags: Tag[] }) {
  const router = useRouter();
  const toast = useToast();
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [exportPayload, setExportPayload] = useState<{
    title: string; filename: string; payload: unknown;
  } | null>(null);

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const bookmarkedIds = useMemo(() => cards.map((c) => c.id), [cards]);

  async function unbookmark(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
    try {
      await api.patch(`/cards/${id}`, { bookmarked: false });
      toast("success", "Card removed from bookmarks");
    } catch {
      toast("error", "Failed to update bookmark");
      router.refresh();
    }
  }

  async function deleteCard(id: string) {
    if (!confirm("Delete this card permanently?")) return;
    setDeleting(id);
    try {
      await api.delete(`/cards/${id}`);
      setCards((cs) => cs.filter((c) => c.id !== id));
      toast("success", "Card deleted");
    } catch {
      toast("error", "Failed to delete");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bookmarks</h1>
          <p className="text-sm text-zinc-500">{cards.length} bookmarked card{cards.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex items-center gap-2">
          {cards.length > 0 && (
            <>
              <button
                onClick={() => {
                  router.push(`/test/session?ids=${bookmarkedIds.join(",")}&shuffle=true`);
                }}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm flex items-center gap-1.5 whitespace-nowrap shadow-sm animate-in fade-in duration-200"
              >
                ▶ Test bookmarks
              </button>
              <button
                onClick={() =>
                  setExportPayload({
                    title: "Export bookmarked cards",
                    filename: "bookmarked-cards",
                    payload: exportCards(cards, tags),
                  })
                }
                title="Export bookmarks"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 whitespace-nowrap"
              >
                <DownloadIcon /> <span>Export</span>
              </button>
            </>
          )}
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-zinc-950/20">
          <p className="text-zinc-500 mb-2">No bookmarked cards yet.</p>
          <p className="text-xs text-zinc-400">
            Go to the <Link href="/cards" className="text-indigo-600 hover:underline">Cards Browser</Link> and tap the star (★) on any card.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
          {cards.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900 flex flex-col gap-2 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    D{c.difficulty}
                  </span>
                  <CardKindBadge kind={c.kind} />
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  {c.tags.slice(0, 3).map((tid) => (
                    <span
                      key={tid}
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
                    >
                      {tagById.get(tid)?.name ?? "?"}
                    </span>
                  ))}
                </div>
              </div>
              <div className="font-medium text-sm flex-1 line-clamp-3">{c.question}</div>
              <div className="text-xs text-zinc-500 line-clamp-2">
                {c.kind === "tf-sort" && `→ ${(c.statements?.length ?? 0)} statements`}
                {c.kind === "flash" && `→ ${c.answer}`}
                {c.kind === "cloze" && `→ ${(c.clozeText?.match(/==(.+?)==/g)?.length ?? 0)} blanks`}
                {c.kind === "match" && `→ ${(c.pairs?.length ?? 0)} pairs`}
                {(!c.kind || c.kind === "mcq") && `→ ${c.answer}`}
              </div>
              <div className="flex justify-end gap-3 pt-1 items-center">
                <button
                  type="button"
                  onClick={() => unbookmark(c.id)}
                  className="text-xs text-amber-500 hover:text-amber-600 focus:outline-none"
                  aria-label="Remove bookmark"
                  title="Remove bookmark"
                >
                  ★
                </button>
                <button
                  onClick={() =>
                    setExportPayload({
                      title: "Export card",
                      filename: `card-${c.id.slice(0, 8)}`,
                      payload: [exportCard(c, tagById)],
                    })
                  }
                  aria-label="Export card"
                  title="Export"
                  className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  <DownloadIcon />
                </button>
                <Link
                  href={`/cards/${c.id}/edit`}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Edit
                </Link>
                <button
                  onClick={() => deleteCard(c.id)}
                  disabled={deleting === c.id}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50"
                >
                  {deleting === c.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ExportDialog
        open={exportPayload !== null}
        title={exportPayload?.title ?? ""}
        filename={exportPayload?.filename ?? "export"}
        payload={exportPayload?.payload ?? []}
        onClose={() => setExportPayload(null)}
      />
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
