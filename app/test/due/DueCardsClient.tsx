"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Card, Review, Tag } from "@/types";
import { selectDue } from "@/lib/due";
import { CardKindBadge } from "@/components/CardKindBadge";

const KIND_CONFIG: Record<string, { label: string; activeClass: string }> = {
  mcq: {
    label: "MCQ",
    activeClass: "bg-indigo-600 border-indigo-600 text-white dark:bg-indigo-950/60 dark:border-indigo-800 dark:text-indigo-300"
  },
  flash: {
    label: "Flash",
    activeClass: "bg-rose-600 border-rose-600 text-white dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-300"
  },
  match: {
    label: "Match",
    activeClass: "bg-purple-600 border-purple-600 text-white dark:bg-purple-950/60 dark:border-purple-800 dark:text-purple-300"
  },
  cloze: {
    label: "Cloze",
    activeClass: "bg-teal-600 border-teal-600 text-white dark:bg-teal-950/60 dark:border-teal-800 dark:text-teal-300"
  },
  multi: {
    label: "Multi",
    activeClass: "bg-cyan-600 border-cyan-600 text-white dark:bg-cyan-950/60 dark:border-cyan-800 dark:text-cyan-300"
  },
  "tf-sort": {
    label: "T/F",
    activeClass: "bg-amber-600 border-amber-600 text-white dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300"
  }
};

export function DueCardsClient({
  cards,
  reviews,
  tags,
}: {
  cards: Card[];
  reviews: Review[];
  tags: Tag[];
}) {
  const [query, setQuery] = useState("");
  const [selectedKinds, setSelectedKinds] = useState<string[]>(["mcq", "multi", "flash", "cloze", "tf-sort", "match"]);

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const { dueIds, newIds } = useMemo(() => {
    return selectDue(cards, reviews, new Date());
  }, [cards, reviews]);

  const allDueCardsList = useMemo(() => {
    const list: { card: Card; isNew: boolean }[] = [];
    dueIds.forEach((id) => {
      const card = cardById.get(id);
      if (card) list.push({ card, isNew: false });
    });
    newIds.forEach((id) => {
      const card = cardById.get(id);
      if (card) list.push({ card, isNew: true });
    });
    return list;
  }, [dueIds, newIds, cardById]);

  const filteredList = useMemo(() => {
    return allDueCardsList.filter(({ card }) => {
      if (!selectedKinds.includes(card.kind || "mcq")) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !card.question.toLowerCase().includes(q) &&
          !card.answer.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [allDueCardsList, query, selectedKinds]);

  const totalCount = allDueCardsList.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 text-xs tracking-widest text-muted uppercase font-semibold mb-2">
            <span className="w-6 h-[2px] bg-accent" />
            Spaced Repetition Queue
          </div>
          <h1 className="cinematic-headline text-[10vw] sm:text-[8vw] md:text-[5vw] leading-[0.85] font-display font-bold tracking-tight mb-1" data-text="DUE CARDS">
            DUE CARDS
          </h1>
          <p className="text-sm text-muted mt-2 uppercase tracking-wider">
            All cards scheduled for active recall practice based on FSRS metrics.
          </p>
        </div>
        {filteredList.length === 0 ? (
          <button
            disabled
            className="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 text-white font-bold text-xs uppercase tracking-widest opacity-40 cursor-not-allowed rounded-[4px]"
          >
            Review Due Cards (0)
          </button>
        ) : (
          <Link
            href={`/test/session?due=1&kinds=${selectedKinds.join(",")}`}
            className="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest transition-colors duration-150 rounded-[4px]"
          >
            Review Due Cards ({filteredList.length}) →
          </Link>
        )}
      </div>

      <hr className="border-t border-divider my-6" />

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border border-border p-4 bg-zinc-950/20 rounded-[4px]">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">Total Due</div>
          <div className="text-2xl font-bold font-display text-accent">{totalCount}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">Overdue / Scheduled</div>
          <div className="text-2xl font-bold font-display text-foreground">{dueIds.length}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">New Cards Today</div>
          <div className="text-2xl font-bold font-display text-foreground">{newIds.length}</div>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-col gap-3 pt-2">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter due questions..."
            className="flex-1 px-3 py-2 border border-border rounded-[4px] bg-transparent text-foreground placeholder-zinc-600 focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted mr-1">Filter Kinds:</span>
          {["mcq", "flash", "match", "cloze", "multi", "tf-sort"].map((k) => {
            const isSelected = selectedKinds.includes(k);
            const config = KIND_CONFIG[k] || { label: k.toUpperCase(), activeClass: "bg-indigo-600 border-indigo-600 text-white" };
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setSelectedKinds((prev) =>
                    prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
                  );
                }}
                className={[
                  "px-2.5 py-1 rounded-[4px] border text-xs font-semibold uppercase tracking-wider transition-colors",
                  isSelected
                    ? config.activeClass
                    : "border-border bg-black/25 text-muted hover:border-zinc-500 hover:text-foreground",
                ].join(" ")}
              >
                {isSelected ? "✓ " : ""}
                {config.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      {filteredList.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center text-sm text-muted rounded-[4px] bg-zinc-950/10">
          {totalCount === 0 ? "You're all caught up! No due reviews for now." : "No cards match your filter query."}
        </div>
      ) : (
        <div className="border border-border rounded-[4px] overflow-hidden bg-zinc-950/10 divide-y divide-divider">
          {filteredList.map(({ card, isNew }) => (
            <div
              key={card.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-zinc-900/20 transition-colors"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardKindBadge kind={card.kind} />
                  {isNew ? (
                    <span className="text-[10px] uppercase font-bold text-accent tracking-wider">
                      New card
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase font-bold text-emerald-500 tracking-wider">
                      Review card
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-foreground truncate max-w-xl">
                  {card.question}
                </h3>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {card.tags.map((tid) => {
                    const t = tagById.get(tid);
                    return t ? (
                      <span key={tid} className="text-[9px] font-semibold text-muted">
                        #{t.name}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-muted font-mono">
                  Diff: {card.difficulty}
                </span>
                <Link
                  href={`/test/session?ids=${card.id}`}
                  className="px-3 py-1.5 border border-border hover:border-accent text-foreground font-bold text-[10px] uppercase tracking-wider transition-colors duration-150 rounded-[4px]"
                >
                  Test →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
