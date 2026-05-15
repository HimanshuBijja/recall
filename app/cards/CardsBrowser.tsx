"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Card, Tag } from "@/types";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { Skeleton } from "@/components/Skeleton";

export function CardsBrowser({ initialCards, tags }: { initialCards: Card[]; tags: Tag[] }) {
  const toast = useToast();
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [diffFilter, setDiffFilter] = useState<number>(0);
  const [deleting, setDeleting] = useState<string | null>(null);

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

  async function del(id: string) {
    if (!confirm("Delete this card?")) return;
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
          <h1 className="text-2xl font-bold">Cards</h1>
          <p className="text-sm text-zinc-500">{filtered.length} of {cards.length}</p>
        </div>
        <Link
          href="/cards/new"
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
        >
          + New card
        </Link>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
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
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900 flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  D{c.difficulty}
                </span>
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
                <Link
                  href={`/cards/${c.id}/edit`}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Edit
                </Link>
                <button
                  onClick={() => del(c.id)}
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
    </div>
  );
}
