"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Card, Confidence, SessionResult, Tag } from "@/types";
import { descendantTagIds } from "@/lib/tags";
import { api } from "@/lib/api";

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface PreparedCard {
  card: Card;
  options: string[];
}

export function TestSession({ cards, tags }: { cards: Card[]; tags: Tag[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const tagsParam = params.get("tags") ?? "";
  const shuffle = params.get("shuffle") !== "false";
  const minDiff = Number(params.get("min") ?? 1);
  const maxDiff = Number(params.get("max") ?? 5);

  const selectedTagIds = useMemo(
    () => tagsParam.split(",").map((s) => s.trim()).filter(Boolean),
    [tagsParam]
  );

  const prepared: PreparedCard[] = useMemo(() => {
    const expanded = descendantTagIds(tags, selectedTagIds);
    const pool =
      selectedTagIds.length === 0
        ? cards
        : cards.filter((c) => c.tags.some((t) => expanded.has(t)));
    const filtered = pool.filter((c) => c.difficulty >= minDiff && c.difficulty <= maxDiff);
    const ordered = shuffle ? shuffleArr(filtered) : filtered;
    return ordered.map((card) => ({
      card,
      options: shuffleArr([card.answer, ...card.distractors]),
    }));
    // intentionally only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [hintShown, setHintShown] = useState(false);
  const [results, setResults] = useState<SessionResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    setPicked(null);
    setHintShown(false);
  }, [idx]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (idx > 0 && idx < prepared.length) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [idx, prepared.length]);

  if (prepared.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-zinc-500 mb-4">No cards matched your filters.</p>
        <button
          onClick={() => router.push("/test/setup")}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white"
        >
          Back to setup
        </button>
      </div>
    );
  }

  const current = prepared[idx];
  const total = prepared.length;
  const progress = ((idx + (picked ? 1 : 0)) / total) * 100;

  function pick(opt: string) {
    if (picked) return;
    setPicked(opt);
  }

  function recordAndAdvance(conf: Confidence) {
    if (!picked) return;
    const correct = picked === current.card.answer;
    const result: SessionResult = {
      cardId: current.card.id,
      correct,
      timeTaken: Date.now() - startRef.current,
      confidence: conf,
    };
    const nextResults = [...results, result];
    setResults(nextResults);
    if (idx + 1 >= total) {
      finish(nextResults);
    } else {
      setIdx(idx + 1);
    }
  }

  async function finish(finalResults: SessionResult[]) {
    setSubmitting(true);
    try {
      const res = await api.post("/sessions", {
        tagIds: selectedTagIds,
        results: finalResults,
      });
      sessionStorage.setItem(
        "lastSession",
        JSON.stringify({ session: res.data, cards: prepared.map((p) => p.card) })
      );
      router.push("/test/result");
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
          <span>
            Card {idx + 1} / {total}
          </span>
          <span>D{current.card.difficulty}</span>
        </div>
        <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-indigo-600 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 bg-white dark:bg-zinc-900 space-y-5">
        <h2 className="text-xl font-medium">{current.card.question}</h2>

        <div className="grid sm:grid-cols-2 gap-2">
          {current.options.map((opt) => {
            const isCorrect = opt === current.card.answer;
            const isPicked = opt === picked;
            const showResult = picked !== null;
            return (
              <button
                key={opt}
                onClick={() => pick(opt)}
                disabled={showResult}
                className={[
                  "text-left px-4 py-3 rounded-lg border transition-colors",
                  !showResult &&
                    "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800",
                  showResult && isCorrect &&
                    "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60",
                  showResult && !isCorrect && isPicked &&
                    "border-rose-500 bg-rose-50 dark:bg-rose-950/60",
                  showResult && !isCorrect && !isPicked &&
                    "border-zinc-200 dark:border-zinc-800 opacity-60",
                ].filter(Boolean).join(" ")}
              >
                {opt}
              </button>
            );
          })}
        </div>

        {!picked && current.card.hint && (
          <div>
            {hintShown ? (
              <div className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 rounded-md">
                💡 {current.card.hint}
              </div>
            ) : (
              <button
                onClick={() => setHintShown(true)}
                className="text-xs text-amber-700 dark:text-amber-400 hover:underline"
              >
                Show hint
              </button>
            )}
          </div>
        )}

        {picked && (
          <div className="space-y-4 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            {current.card.explanation && (
              <div>
                <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">
                  Explanation
                </div>
                <p className="text-sm">{current.card.explanation}</p>
              </div>
            )}
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
                How confident were you?
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  [1, "Not sure"],
                  [2, "OK"],
                  [3, "Confident"],
                ] as const).map(([c, label]) => (
                  <button
                    key={c}
                    onClick={() => recordAndAdvance(c)}
                    disabled={submitting}
                    className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 text-sm font-medium disabled:opacity-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
