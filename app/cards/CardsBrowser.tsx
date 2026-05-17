"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Card, Tag } from "@/types";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { Skeleton } from "@/components/Skeleton";
import { ExportDialog } from "@/components/ExportDialog";
import { exportCard, exportCards } from "@/lib/export";

export function CardsBrowser({ initialCards, tags }: { initialCards: Card[]; tags: Tag[] }) {
  const toast = useToast();
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [diffFilter, setDiffFilter] = useState<number>(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportPayload, setExportPayload] = useState<{
    title: string; filename: string; payload: unknown;
  } | null>(null);

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (tagFilter && !c.tags.includes(tagFilter)) return false;
      if (diffFilter && c.difficulty !== diffFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !c.question.toLowerCase().includes(q) &&
          !c.answer.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [cards, query, tagFilter, diffFilter]);

  const filteredIds = useMemo(() => new Set(filtered.map((c) => c.id)), [filtered]);
  const allSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds((s) => {
        const n = new Set(s);
        for (const id of filteredIds) n.delete(id);
        return n;
      });
    } else {
      setSelectedIds((s) => new Set([...s, ...filteredIds]));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function del(id: string) {
    if (!confirm("Delete this card?")) return;
    setDeleting(id);
    try {
      await api.delete(`/cards/${id}`);
      setCards((cs) => cs.filter((c) => c.id !== id));
      setSelectedIds((s) => { const n = new Set(s); n.delete(id); return n; });
      toast("success", "Card deleted");
    } catch {
      toast("error", "Failed to delete");
    } finally {
      setDeleting(null);
    }
  }

  async function deleteSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const ok = confirm(`Delete ${ids.length} card${ids.length === 1 ? "" : "s"}?`);
    if (!ok) return;
    let count = 0;
    for (const id of ids) {
      try {
        await api.delete(`/cards/${id}`);
        count++;
      } catch { /* skip */ }
    }
    setCards((cs) => cs.filter((c) => !ids.includes(c.id)));
    setSelectedIds(new Set());
    toast("success", `Deleted ${count} card${count === 1 ? "" : "s"}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Cards</h1>
          <p className="text-sm text-zinc-500">{filtered.length} of {cards.length}</p>
        </div>
        <div className="flex items-center gap-2">
          {cards.length > 0 && (
            <button
              onClick={() =>
                setExportPayload({
                  title: "Export all cards",
                  filename: "cards",
                  payload: exportCards(cards, tags),
                })
              }
              title="Export all cards"
              aria-label="Export all cards"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 whitespace-nowrap"
            >
              <DownloadIcon /> <span className="hidden sm:inline">Export</span>
            </button>
          )}
          <Link
            href="/cards/new"
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm whitespace-nowrap"
          >
            + New card
          </Link>
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={toggleSelectAll}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <span
              className={[
                "w-4 h-4 inline-flex items-center justify-center rounded border text-[10px]",
                allSelected
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "border-zinc-300 dark:border-zinc-700 text-transparent",
              ].join(" ")}
              aria-hidden="true"
            >
              ✓
            </span>
            {allSelected ? "Deselect all" : "Select all"}
          </button>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 ml-auto rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-1">
              <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300 pl-1.5">
                {selectedIds.size} selected
              </span>
              <button
                onClick={() => {
                  const picked = cards.filter((c) => selectedIds.has(c.id));
                  setExportPayload({
                    title: `Export ${picked.length} card${picked.length === 1 ? "" : "s"}`,
                    filename: `cards-selection-${picked.length}`,
                    payload: exportCards(picked, tags),
                  });
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950"
              >
                <DownloadIcon /> Export
              </button>
              <button
                onClick={deleteSelected}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950"
              >
                ✕ Delete
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-2 py-1 rounded-md text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
        />
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={diffFilter}
          onChange={(e) => setDiffFilter(Number(e.target.value))}
          className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
        >
          <option value={0}>Any difficulty</option>
          {[1, 2, 3, 4, 5].map((d) => (
            <option key={d} value={d}>
              Difficulty {d}
            </option>
          ))}
        </select>
      </div>

      {cards.length === 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-zinc-500">No cards match.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
          {filtered.map((c) => {
            const sel = selectedIds.has(c.id);
            return (
              <li
                key={c.id}
                onClick={() => toggleSelect(c.id)}
                className={[
                  "rounded-xl border p-4 bg-white dark:bg-zinc-900 flex flex-col gap-2 cursor-pointer transition-colors",
                  sel
                    ? "border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-200 dark:ring-indigo-900"
                    : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={[
                        "shrink-0 w-5 h-5 inline-flex items-center justify-center rounded border text-xs",
                        sel
                          ? "bg-indigo-600 border-indigo-600 text-white"
                          : "border-zinc-300 dark:border-zinc-700 text-transparent",
                      ].join(" ")}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      D{c.difficulty}
                    </span>
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
                <div className="text-xs text-zinc-500 line-clamp-2">→ {c.answer}</div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExportPayload({
                        title: "Export card",
                        filename: `card-${c.id.slice(0, 8)}`,
                        payload: [exportCard(c, tagById)],
                      });
                    }}
                    aria-label="Export card"
                    title="Export"
                    className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    <DownloadIcon />
                  </button>
                  <Link
                    href={`/cards/${c.id}/edit`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={(e) => { e.stopPropagation(); del(c.id); }}
                    disabled={deleting === c.id}
                    className="text-xs text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50"
                  >
                    {deleting === c.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </li>
            );
          })}
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
