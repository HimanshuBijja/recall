"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function fmtMs(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}

interface PreparedCard {
  card: Card;
  options: string[];
}

const OPTION_LETTERS = ["A", "B", "C", "D"];

export function TestSession({ cards, tags }: { cards: Card[]; tags: Tag[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const tagsParam = params.get("tags") ?? "";
  const shuffle = params.get("shuffle") !== "false";
  const minDiff = Number(params.get("min") ?? 1);
  const maxDiff = Number(params.get("max") ?? 5);
  const retryMode = params.get("retry") === "1";

  const selectedTagIds = useMemo(
    () => tagsParam.split(",").map((s) => s.trim()).filter(Boolean),
    [tagsParam]
  );

  const prepared: PreparedCard[] = useMemo(() => {
    let pool: Card[];
    if (retryMode) {
      try {
        const raw = sessionStorage.getItem("retryCards");
        pool = raw ? (JSON.parse(raw) as Card[]) : [];
      } catch {
        pool = [];
      }
    } else {
      const expanded = descendantTagIds(tags, selectedTagIds);
      pool =
        selectedTagIds.length === 0
          ? cards
          : cards.filter((c) => c.tags.some((t) => expanded.has(t)));
      pool = pool.filter((c) => c.difficulty >= minDiff && c.difficulty <= maxDiff);
    }
    const ordered = shuffle ? shuffleArr(pool) : pool;
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
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(Date.now());

  // Reset per-card state on advance.
  useEffect(() => {
    startRef.current = Date.now();
    setPicked(null);
    setHintShown(false);
    setElapsed(0);
  }, [idx]);

  // Live timer (stops once answered)
  useEffect(() => {
    if (picked) return;
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 100);
    return () => clearInterval(t);
  }, [picked, idx]);

  // beforeunload guard
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

  const current = prepared[idx];
  const total = prepared.length;

  const recordAndAdvance = useCallback(
    (conf: Confidence, currentPicked: string) => {
      const correct = currentPicked === current.card.answer;
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idx, total, results, current]
  );

  async function finish(finalResults: SessionResult[]) {
    setSubmitting(true);
    try {
      const res = await api.post("/sessions", {
        tagIds: selectedTagIds,
        results: finalResults,
      });
      sessionStorage.setItem(
        "lastSession",
        JSON.stringify({
          session: res.data,
          cards: prepared.map((p) => p.card),
          tags,
        })
      );
      sessionStorage.removeItem("retryCards");
      router.push("/test/result");
    } catch {
      setSubmitting(false);
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === "INPUT") return;
      if (!picked) {
        // 1-4 picks an option
        if (e.key >= "1" && e.key <= "4") {
          const i = Number(e.key) - 1;
          if (i < current.options.length) {
            e.preventDefault();
            setPicked(current.options[i]);
          }
        } else if (e.key.toLowerCase() === "h") {
          if (current.card.hint) {
            e.preventDefault();
            setHintShown((s) => !s);
          }
        } else if (e.key.toLowerCase() === "s") {
          // skip → counts as wrong with low confidence
          e.preventDefault();
          recordAndAdvance(1, "__skipped__");
        }
      } else {
        // 1/2/3 sets confidence and advances
        if (e.key >= "1" && e.key <= "3") {
          e.preventDefault();
          recordAndAdvance(Number(e.key) as Confidence, picked);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, picked, recordAndAdvance]);

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

  const progress = (idx / total) * 100;
  const correctCount = results.filter((r) => r.correct).length;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Top bar: progress + score chips */}
      <div className="space-y-2">
        <div className="flex justify-between items-center gap-2 text-xs flex-wrap">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="font-mono text-zinc-500">
              {idx + 1} / {total}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
              D{current.card.difficulty}
            </span>
            {retryMode && (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                retry
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 font-mono text-zinc-500">
            <span className="text-emerald-600 dark:text-emerald-400">✓ {correctCount}</span>
            <span className="text-rose-600 dark:text-rose-400">✗ {results.length - correctCount}</span>
            {!picked && <span className="tabular-nums">⏱ {fmtMs(elapsed)}</span>}
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-indigo-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question card */}
      <div
        key={idx}
        className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 sm:p-6 bg-white dark:bg-zinc-900 space-y-5 animate-in fade-in duration-200"
      >
        <h2 className="text-base sm:text-xl font-medium leading-relaxed">
          {current.card.question}
        </h2>

        <div className="grid sm:grid-cols-2 gap-2 sm:gap-2.5">
          {current.options.map((opt, i) => {
            const isCorrect = opt === current.card.answer;
            const isPicked = opt === picked;
            const showResult = picked !== null;
            return (
              <button
                key={opt}
                onClick={() => !picked && setPicked(opt)}
                disabled={showResult}
                className={[
                  "group text-left px-4 py-3 rounded-lg border transition-all flex items-start gap-3",
                  !showResult &&
                    "border-zinc-300 dark:border-zinc-700 hover:border-indigo-500 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20",
                  showResult && isCorrect &&
                    "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60",
                  showResult && !isCorrect && isPicked &&
                    "border-rose-500 bg-rose-50 dark:bg-rose-950/60",
                  showResult && !isCorrect && !isPicked &&
                    "border-zinc-200 dark:border-zinc-800 opacity-50",
                ].filter(Boolean).join(" ")}
              >
                <kbd
                  className={[
                    "shrink-0 w-6 h-6 inline-flex items-center justify-center rounded text-xs font-mono font-semibold",
                    !showResult && "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 group-hover:bg-indigo-600 group-hover:text-white",
                    showResult && isCorrect && "bg-emerald-600 text-white",
                    showResult && !isCorrect && isPicked && "bg-rose-600 text-white",
                    showResult && !isCorrect && !isPicked && "bg-zinc-100 dark:bg-zinc-800 text-zinc-400",
                  ].filter(Boolean).join(" ")}
                >
                  {OPTION_LETTERS[i]}
                </kbd>
                <span className="flex-1">{opt}</span>
                {showResult && isCorrect && <span className="text-emerald-600 dark:text-emerald-400">✓</span>}
                {showResult && !isCorrect && isPicked && <span className="text-rose-600 dark:text-rose-400">✗</span>}
              </button>
            );
          })}
        </div>

        {/* Hint */}
        {!picked && current.card.hint && (
          <div>
            {hintShown ? (
              <div className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-3 py-2 rounded-lg">
                💡 {current.card.hint}
              </div>
            ) : (
              <button
                onClick={() => setHintShown(true)}
                className="text-xs text-amber-700 dark:text-amber-400 hover:underline inline-flex items-center gap-1"
              >
                💡 Show hint
                <kbd className="ml-1 px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-[10px]">H</kbd>
              </button>
            )}
          </div>
        )}

        {/* Post-answer */}
        {picked && (
          <div className="space-y-4 pt-2 border-t border-zinc-200 dark:border-zinc-800 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-sm">
              <span
                className={
                  picked === current.card.answer
                    ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                    : "text-rose-600 dark:text-rose-400 font-semibold"
                }
              >
                {picked === current.card.answer ? "Correct!" : "Incorrect"}
              </span>
              <span className="text-zinc-500">· answered in {fmtMs(Date.now() - startRef.current)}</span>
            </div>

            {current.card.explanation && (
              <div>
                <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">
                  Explanation
                </div>
                <p className="text-sm leading-relaxed">{current.card.explanation}</p>
              </div>
            )}

            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
                How confident were you?
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  [1, "Not sure", "rose"],
                  [2, "OK", "amber"],
                  [3, "Confident", "emerald"],
                ] as const).map(([c, label, tone]) => (
                  <button
                    key={c}
                    onClick={() => recordAndAdvance(c, picked)}
                    disabled={submitting}
                    className={[
                      "px-3 py-2 rounded-lg border text-sm font-medium transition-colors inline-flex items-center justify-center gap-2",
                      "border-zinc-300 dark:border-zinc-700",
                      tone === "rose" && "hover:bg-rose-600 hover:text-white hover:border-rose-600",
                      tone === "amber" && "hover:bg-amber-500 hover:text-white hover:border-amber-500",
                      tone === "emerald" && "hover:bg-emerald-600 hover:text-white hover:border-emerald-600",
                      "disabled:opacity-50",
                    ].filter(Boolean).join(" ")}
                  >
                    {label}
                    <kbd className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] font-mono">{c}</kbd>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Keyboard hints */}
      <div className="text-[11px] text-zinc-500 flex flex-wrap gap-x-4 gap-y-1 justify-center">
        {!picked ? (
          <>
            <span>
              <Kbd>1</Kbd>–<Kbd>4</Kbd> answer
            </span>
            {current.card.hint && (
              <span>
                <Kbd>H</Kbd> hint
              </span>
            )}
            <span>
              <Kbd>S</Kbd> skip
            </span>
          </>
        ) : (
          <span>
            <Kbd>1</Kbd>/<Kbd>2</Kbd>/<Kbd>3</Kbd> rate confidence & continue
          </span>
        )}
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono">
      {children}
    </kbd>
  );
}
