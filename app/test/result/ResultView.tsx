"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Card, Session, Tag } from "@/types";

interface Snap {
  session: Session;
  cards: Card[];
  tags: Tag[];
}

function fmtMs(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
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

  const { session, cards, tags } = snap;
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const missed = session.results.filter((r) => !r.correct);
  const totalTime = session.results.reduce((a, r) => a + r.timeTaken, 0);
  const avgTime = session.results.length
    ? Math.round(totalTime / session.results.length)
    : 0;

  // Per-tag breakdown
  const tagAgg = new Map<string, { total: number; correct: number; time: number }>();
  for (const r of session.results) {
    const card = cardById.get(r.cardId);
    if (!card) continue;
    for (const tag of card.tags) {
      const b = tagAgg.get(tag) ?? { total: 0, correct: 0, time: 0 };
      b.total += 1;
      b.time += r.timeTaken;
      if (r.correct) b.correct += 1;
      tagAgg.set(tag, b);
    }
  }
  const tagRows = [...tagAgg.entries()]
    .map(([tagId, b]) => ({
      tagId,
      name: tagById.get(tagId)?.name ?? "(deleted tag)",
      ...b,
      accuracy: Math.round((b.correct / b.total) * 100),
      avgTime: Math.round(b.time / b.total),
    }))
    .sort((a, b) => a.accuracy - b.accuracy);

  const scoreTone =
    session.score >= 75
      ? "text-emerald-600 dark:text-emerald-400"
      : session.score >= 50
      ? "text-amber-600 dark:text-amber-400"
      : "text-rose-600 dark:text-rose-400";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center py-8">
        <div className="text-sm uppercase tracking-wide text-zinc-500">Your score</div>
        <div className={`text-6xl font-bold mt-2 ${scoreTone}`}>{session.score}%</div>
        <div className="text-sm text-zinc-500 mt-1">
          {session.results.filter((r) => r.correct).length} / {session.results.length} correct
          {" · "}
          avg {fmtMs(avgTime)} per card
        </div>
      </div>

      <div className="flex gap-3 justify-center flex-wrap">
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
            Retry missed ({missed.length})
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

      {tagRows.length > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900">
          <h3 className="font-semibold mb-3">By tag</h3>
          <ul className="space-y-3">
            {tagRows.map((row) => {
              const tone =
                row.accuracy >= 75
                  ? "bg-emerald-500"
                  : row.accuracy >= 50
                  ? "bg-amber-500"
                  : "bg-rose-500";
              return (
                <li key={row.tagId} className="text-sm">
                  <div className="flex justify-between mb-1 items-baseline">
                    <span className="font-medium">{row.name}</span>
                    <span className="text-xs text-zinc-500 font-mono">
                      {row.correct}/{row.total} · {row.accuracy}% · {fmtMs(row.avgTime)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                    <div className={`h-full ${tone}`} style={{ width: `${row.accuracy}%` }} />
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
          <ul className="space-y-4">
            {missed.map((r, i) => {
              const card = cardById.get(r.cardId);
              if (!card) return null;
              return (
                <li
                  key={r.cardId + ":" + i}
                  className="border-l-2 border-rose-500 pl-3 space-y-1"
                >
                  <div className="text-sm font-medium">{card.question}</div>
                  {card.kind === "tf-sort" && card.statements ? (
                    <ul className="text-xs space-y-0.5 mt-1">
                      {card.statements.map((s, j) => (
                        <li key={j} className="flex gap-2">
                          <span
                            className={
                              s.isTrue
                                ? "text-emerald-600 dark:text-emerald-400 font-semibold w-4 shrink-0"
                                : "text-rose-600 dark:text-rose-400 font-semibold w-4 shrink-0"
                            }
                          >
                            {s.isTrue ? "T" : "F"}
                          </span>
                          <span className="text-zinc-600 dark:text-zinc-400">{s.text}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-xs">
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Correct: {card.answer}
                      </span>
                    </div>
                  )}
                  {card.explanation && (
                    <div className="text-xs text-zinc-500">{card.explanation}</div>
                  )}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {card.tags.slice(0, 4).map((tid) => (
                      <span
                        key={tid}
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                      >
                        {tagById.get(tid)?.name ?? "?"}
                      </span>
                    ))}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-mono">
                      {fmtMs(r.timeTaken)}
                    </span>
                    <Link
                      href={`/cards/${card.id}/edit`}
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline ml-auto"
                    >
                      edit card →
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      
    </div>
  );
}
