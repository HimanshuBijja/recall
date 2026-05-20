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
  statementOrder: number[];
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
    return ordered.map((card) => {
      const statementOrder = card.statements
        ? shuffleArr(card.statements.map((_, i) => i))
        : [];
      return {
        card,
        options: card.kind === "tf-sort"
          ? []
          : shuffleArr([card.answer, ...card.distractors]),
        statementOrder,
      };
    });
    // intentionally only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [tfAssignments, setTfAssignments] = useState<Record<number, boolean | null>>({});
  const [tfSubmitted, setTfSubmitted] = useState(false);
  const [tfFocus, setTfFocus] = useState(0);
  const [hintShown, setHintShown] = useState(false);
  const [results, setResults] = useState<SessionResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(Date.now());

  // Reset per-card state on advance.
  useEffect(() => {
    startRef.current = Date.now();
    setPicked(null);
    setTfAssignments({});
    setTfSubmitted(false);
    setTfFocus(0);
    setHintShown(false);
    setElapsed(0);
  }, [idx]);

  // Live timer (stops once answered)
  useEffect(() => {
    if (picked || tfSubmitted) return;
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 100);
    return () => clearInterval(t);
  }, [picked, tfSubmitted, idx]);

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
  const isTfSort = current?.card.kind === "tf-sort" && !!current.card.statements;
  const tfStatements = isTfSort ? current.card.statements! : [];
  const tfAllAssigned =
    isTfSort && tfStatements.every((_, i) => tfAssignments[i] === true || tfAssignments[i] === false);
  const tfAllCorrect =
    isTfSort && tfStatements.every((s, i) => tfAssignments[i] === s.isTrue);
  const answered = isTfSort ? tfSubmitted : picked !== null;

  const recordAndAdvance = useCallback(
    (conf: Confidence, currentPicked: string, overrideCorrect?: boolean) => {
      const correct =
        overrideCorrect !== undefined
          ? overrideCorrect
          : currentPicked === current.card.answer;
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
      if (!answered) {
        if (isTfSort) {
          const order = current.statementOrder;
          const n = order.length;
          const key = e.key.toLowerCase();
          const advance = () => setTfFocus((f) => Math.min(n - 1, f + 1));
          const assign = (val: boolean) => {
            const sIdx = order[tfFocus];
            if (sIdx === undefined) return;
            setTfAssignments((m) => ({ ...m, [sIdx]: val }));
            advance();
          };
          if (key === "t" || e.key === "1" || e.key === "ArrowLeft") {
            e.preventDefault();
            assign(true);
          } else if (key === "f" || e.key === "2" || e.key === "ArrowRight") {
            e.preventDefault();
            assign(false);
          } else if (e.key === "ArrowDown" || key === "j") {
            e.preventDefault();
            setTfFocus((f) => Math.min(n - 1, f + 1));
          } else if (e.key === "ArrowUp" || key === "k") {
            e.preventDefault();
            setTfFocus((f) => Math.max(0, f - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const allAssigned = order.every(
              (sIdx) => tfAssignments[sIdx] === true || tfAssignments[sIdx] === false
            );
            if (allAssigned) setTfSubmitted(true);
          } else if (key === "h") {
            if (current.card.hint) {
              e.preventDefault();
              setHintShown((s) => !s);
            }
          } else if (key === "s") {
            e.preventDefault();
            setTfSubmitted(true);
          }
        } else if (e.key >= "1" && e.key <= "4") {
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
          e.preventDefault();
          recordAndAdvance(1, "__skipped__");
        }
      } else {
        if (e.key >= "1" && e.key <= "3") {
          e.preventDefault();
          if (isTfSort) {
            recordAndAdvance(Number(e.key) as Confidence, "", tfAllCorrect);
          } else if (picked) {
            recordAndAdvance(Number(e.key) as Confidence, picked);
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, picked, answered, isTfSort, tfAllCorrect, tfAssignments, tfFocus, recordAndAdvance]);

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

        {isTfSort ? (
          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-[1fr_auto] text-[11px] uppercase tracking-wide text-zinc-500 px-1">
              <span>Statement</span>
              <span className="text-right">Sort into bin</span>
            </div>
            {current.statementOrder.map((sIdx, displayIdx) => {
              const s = tfStatements[sIdx];
              const assigned = tfAssignments[sIdx];
              const correctAnswer = s.isTrue;
              const rowCorrect = tfSubmitted && assigned === correctAnswer;
              const rowWrong = tfSubmitted && assigned !== correctAnswer;
              const isFocused = !tfSubmitted && displayIdx === tfFocus;
              return (
                <div
                  key={sIdx}
                  onClick={() => !tfSubmitted && setTfFocus(displayIdx)}
                  className={[
                    "flex items-center gap-2 sm:gap-3 px-3 py-2.5 rounded-lg border transition-colors",
                    rowCorrect && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60",
                    rowWrong && "border-rose-500 bg-rose-50 dark:bg-rose-950/60",
                    !tfSubmitted && !isFocused && "border-zinc-300 dark:border-zinc-700",
                    isFocused && "border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900",
                  ].filter(Boolean).join(" ")}
                >
                  <span className="flex-1 text-sm leading-relaxed">{s.text}</span>
                  <div className="inline-flex rounded-lg border border-zinc-300 dark:border-zinc-700 p-0.5 shrink-0 bg-white dark:bg-zinc-900">
                    {([true, false] as const).map((val) => {
                      const picked = assigned === val;
                      const isCorrect = tfSubmitted && val === correctAnswer;
                      const isWrongPick = tfSubmitted && picked && val !== correctAnswer;
                      return (
                        <button
                          key={String(val)}
                          type="button"
                          disabled={tfSubmitted}
                          onClick={() =>
                            setTfAssignments((m) => ({ ...m, [sIdx]: val }))
                          }
                          className={[
                            "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors min-w-[44px]",
                            !tfSubmitted && picked && val
                              ? "bg-emerald-600 text-white"
                              : !tfSubmitted && picked && !val
                              ? "bg-rose-600 text-white"
                              : !tfSubmitted
                              ? "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                              : isCorrect
                              ? "bg-emerald-600 text-white"
                              : isWrongPick
                              ? "bg-zinc-300 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                              : "text-zinc-400",
                          ].join(" ")}
                          aria-label={val ? "True" : "False"}
                        >
                          {val ? "True" : "False"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {!tfSubmitted && (
              <button
                type="button"
                onClick={() => setTfSubmitted(true)}
                disabled={!tfAllAssigned}
                className="w-full mt-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50"
              >
                {tfAllAssigned
                  ? "Submit"
                  : `Assign all ${tfStatements.length} statements to continue`}
              </button>
            )}
          </div>
        ) : (
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
        )}

        {/* Hint */}
        {!answered && current.card.hint && (
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
        {answered && (() => {
          const cardCorrect = isTfSort ? tfAllCorrect : picked === current.card.answer;
          const tfCorrectCount = isTfSort
            ? tfStatements.filter((s, i) => tfAssignments[i] === s.isTrue).length
            : 0;
          return (
          <div className="space-y-4 pt-2 border-t border-zinc-200 dark:border-zinc-800 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span
                className={
                  cardCorrect
                    ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                    : "text-rose-600 dark:text-rose-400 font-semibold"
                }
              >
                {cardCorrect ? "Correct!" : "Incorrect"}
              </span>
              {isTfSort && (
                <span className="text-zinc-500">
                  · {tfCorrectCount}/{tfStatements.length} statements sorted right
                </span>
              )}
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
                    onClick={() =>
                      isTfSort
                        ? recordAndAdvance(c, "", tfAllCorrect)
                        : recordAndAdvance(c, picked!)
                    }
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
          );
        })()}
      </div>

      {/* Keyboard hints */}
      <div className="text-[11px] text-zinc-500 flex flex-wrap gap-x-4 gap-y-1 justify-center">
        {!answered ? (
          <>
            {isTfSort ? (
              <>
                <span>
                  <Kbd>T</Kbd>/<Kbd>F</Kbd> assign
                </span>
                <span>
                  <Kbd>↑</Kbd><Kbd>↓</Kbd> move
                </span>
                <span>
                  <Kbd>Enter</Kbd> submit
                </span>
              </>
            ) : (
              <span>
                <Kbd>1</Kbd>–<Kbd>4</Kbd> answer
              </span>
            )}
            {current.card.hint && (
              <span>
                <Kbd>H</Kbd> hint
              </span>
            )}
            <span>
              <Kbd>S</Kbd> {isTfSort ? "submit" : "skip"}
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
