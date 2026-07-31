"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Card, Review } from "@/types";
import { getReviewsSummary } from "@/lib/due";

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

export function DueReviewPanel({
  nonExemptedCards,
  reviews,
}: {
  nonExemptedCards: Card[];
  reviews: Review[];
}) {
  const [selectedKinds, setSelectedKinds] = useState<string[]>(["mcq", "multi", "flash", "cloze", "tf-sort", "match"]);

  const availableKinds = useMemo(() => {
    const kinds = new Set<string>();
    for (const c of nonExemptedCards) {
      kinds.add(c.kind || "mcq");
    }
    return Array.from(kinds);
  }, [nonExemptedCards]);

  const filteredCards = useMemo(() => {
    return nonExemptedCards.filter((c) => selectedKinds.includes(c.kind || "mcq"));
  }, [nonExemptedCards, selectedKinds]);

  const summary = useMemo(() => {
    return getReviewsSummary(filteredCards, reviews, new Date());
  }, [filteredCards, reviews]);

  function toggleKind(k: string) {
    setSelectedKinds((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
    );
  }

  return (
    <div className="border border-border p-6 bg-zinc-950/40 space-y-4 rounded-[4px]">
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-accent font-bold">Due Review Batch</div>
        <h2 className="text-lg font-bold uppercase font-display tracking-tight text-foreground flex items-center gap-2">
          Spaced Repetition
          {summary.due > 0 && <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />}
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted font-mono pt-1">
          <span>{summary.due} due</span>
          <span>·</span>
          <span>{summary.overdue} overdue</span>
          <span>·</span>
          <span>{summary.new} new</span>
        </div>
      </div>

      {availableKinds.length > 0 && (
        <div className="space-y-1.5 pt-1.5 border-t border-divider">
          <div className="text-[9px] uppercase font-bold tracking-wider text-muted mb-0.5">Filter Types:</div>
          <div className="flex flex-wrap gap-1.5">
            {availableKinds.map((k) => {
              const isSelected = selectedKinds.includes(k);
              const config = KIND_CONFIG[k] || { label: k.toUpperCase(), activeClass: "bg-indigo-600 border-indigo-600 text-white" };
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleKind(k)}
                  className={[
                    "px-2 py-0.5 rounded-[4px] border text-[10px] font-semibold uppercase tracking-wider transition-colors",
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
      )}

      <Link
        href={`/test/session?due=1&kinds=${selectedKinds.join(",")}`}
        className={`w-full inline-flex items-center justify-center px-4 py-3 bg-accent text-background font-bold text-xs uppercase tracking-widest transition-colors duration-150 hover:bg-opacity-90 rounded-[4px] ${
          summary.due === 0 ? "opacity-40 cursor-not-allowed pointer-events-none" : ""
        }`}
      >
        Review Due Cards ({summary.due}) →
      </Link>
    </div>
  );
}
