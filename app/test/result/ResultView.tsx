"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Card, Session } from "@/types";

interface Snap {
  session: Session;
  cards: Card[];
}

export function ResultView() {
  const router = useRouter();
  const [snap, setSnap] = useState<Snap | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("lastSession");
    if (!raw) {
      router.replace("/");
      return;
    }
    setSnap(JSON.parse(raw));
  }, [router]);

  if (!snap) return null;

  const { session, cards } = snap;
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const missed = session.results.filter((r) => !r.correct);

  // Per-tag breakdown
  const tagAgg = new Map<string, { total: number; correct: number }>();
  for (const r of session.results) {
    const card = cardById.get(r.cardId);
    if (!card) continue;
    for (const tag of card.tags) {
      const b = tagAgg.get(tag) ?? { total: 0, correct: 0 };
      b.total += 1;
      if (r.correct) b.correct += 1;
      tagAgg.set(tag, b);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center py-8">
        <div className="text-sm uppercase tracking-wide text-zinc-500">Your score</div>
        <div className="text-6xl font-bold mt-2">{session.score}%</div>
        <div className="text-sm text-zinc-500 mt-1">
          {session.results.filter((r) => r.correct).length} / {session.results.length} correct
        </div>
      </div>

      {tagAgg.size > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900">
          <h3 className="font-semibold mb-3">By tag</h3>
          <ul className="space-y-2">
            {[...tagAgg.entries()].map(([tagId, b]) => {
              const pct = Math.round((b.correct / b.total) * 100);
              return (
                <li key={tagId} className="text-sm">
                  <div className="flex justify-between mb-1">
                    <span className="font-mono text-xs text-zinc-500">{tagId.slice(0, 8)}</span>
                    <span>{b.correct}/{b.total} · {pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className={pct >= 75 ? "h-full bg-emerald-500" : pct >= 50 ? "h-full bg-amber-500" : "h-full bg-rose-500"}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {missed.length > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900">
          <h3 className="font-semibold mb-3">Missed ({missed.length})</h3>
          <ul className="space-y-3">
            {missed.map((r) => {
              const card = cardById.get(r.cardId);
              if (!card) return null;
              return (
                <li key={r.cardId} className="text-sm border-l-2 border-rose-500 pl-3">
                  <div className="font-medium">{card.question}</div>
                  <div className="text-zinc-500 text-xs mt-1">→ {card.answer}</div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex gap-3 justify-center">
        {missed.length > 0 && (
          <button
            onClick={() => {
              const ids = new Set(missed.map((m) => m.cardId));
              const cardsForRetry = cards.filter((c) => ids.has(c.id));
              sessionStorage.setItem("retryCards", JSON.stringify(cardsForRetry));
              router.push("/test/session?retry=1");
            }}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
          >
            Retry missed
          </button>
        )}
        <Link
          href="/test/setup"
          className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 font-medium"
        >
          New test
        </Link>
        <Link
          href="/analytics"
          className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 font-medium"
        >
          Analytics
        </Link>
      </div>
    </div>
  );
}
