"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Card, Confidence, SessionResult, Tag } from "@/types";
import { descendantTagIds } from "@/lib/tags";
import { api } from "@/lib/api";
import { selectPool } from "@/lib/session-pool";
import { useSwipe } from "@/hooks/useSwipe";
import { parseCloze, gradeCloze } from "@/lib/cloze";
import { gradeMulti } from "@/lib/multi";
import { Skeleton } from "@/components/Skeleton";
import { CardFrame } from "@/components/CardFrame";

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
  const idsParam = params.get("ids") ?? "";
  const videoIdParam = params.get("videoId") ?? "";
  const shuffle = params.get("shuffle") !== "false";
  const minDiff = Number(params.get("min") ?? 1);
  const maxDiff = Number(params.get("max") ?? 5);
  const retryMode = params.get("retry") === "1";
  const dueMode = params.get("due") === "1";

  const selectedTagIds = useMemo(
    () => tagsParam.split(",").map((s) => s.trim()).filter(Boolean),
    [tagsParam]
  );

  const idList = useMemo(
    () => idsParam.split(",").map((s) => s.trim()).filter(Boolean),
    [idsParam]
  );

  const initialPrepared: PreparedCard[] = useMemo(() => {
    if (dueMode) return [];
    let pool: Card[];
    if (retryMode) {
      try {
        const raw = sessionStorage.getItem("retryCards");
        pool = raw ? (JSON.parse(raw) as Card[]) : [];
      } catch {
        pool = [];
      }
    } else {
      if (videoIdParam) {
        pool = cards.filter((c) => c.source?.videoId === videoIdParam);
      } else {
        const expanded = descendantTagIds(tags, selectedTagIds);
        pool = selectPool(cards, {
          ids: idList.length ? idList : undefined,
          tagIds: selectedTagIds,
          expanded,
          minDiff,
          maxDiff,
        });
      }
    }
    const ordered = shuffle ? shuffleArr(pool) : pool;
    return ordered.map((card) => {
      const statementOrder = card.statements
        ? shuffleArr(card.statements.map((_, i) => i))
        : [];
      return {
        card,
        options:
          card.kind === "tf-sort" || card.kind === "flash" || card.kind === "cloze" || card.kind === "match"
            ? []
            : card.kind === "multi"
            ? shuffleArr([...(card.answers ?? []), ...card.distractors])
            : shuffleArr([card.answer, ...card.distractors]),
        statementOrder,
      };
    });
    // intentionally only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [prepared, setPrepared] = useState<PreparedCard[]>(initialPrepared);
  const [loadingDue, setLoadingDue] = useState(dueMode);
  const [showBatchPrompt, setShowBatchPrompt] = useState(false);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

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
  const [flipped, setFlipped] = useState(false);
  const [clozeInputs, setClozeInputs] = useState<Record<number, string>>({});
  const [clozeSubmitted, setClozeSubmitted] = useState(false);
  const [, setClozeFocus] = useState(0);
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [selectedRight, setSelectedRight] = useState<number | null>(null);
  const [matchedPairs, setMatchedPairs] = useState<Set<number>>(new Set());
  const [matchMistakes, setMatchMistakes] = useState(0);
  const [wrongPair, setWrongPair] = useState<[number, number] | null>(null);
  const [multiPicked, setMultiPicked] = useState<Set<string>>(new Set());
  const [multiSubmitted, setMultiSubmitted] = useState(false);
  const [leftOrder, setLeftOrder] = useState<number[]>([]);
  const [rightOrder, setRightOrder] = useState<number[]>([]);

  const loadDueBatch = useCallback(
    async (excludeIds: Set<string>) => {
      setLoadingDue(true);
      try {
        const excludeStr = Array.from(excludeIds).join(",");
        const res = await api.get<{ dueIds: string[]; newIds: string[] }>(
          `/reviews/due?newLimit=20&exclude=${excludeStr}`
        );
        const combinedIds = [...res.data.dueIds, ...res.data.newIds].slice(0, 20);
        if (combinedIds.length === 0) {
          return [];
        }
        const cardMap = new Map(cards.map((c) => [c.id, c]));
        const batchCards = combinedIds
          .map((id) => cardMap.get(id))
          .filter((c): c is Card => !!c);

        const preparedBatch = batchCards.map((card) => {
          const statementOrder = card.statements
            ? shuffleArr(card.statements.map((_, i) => i))
            : [];
          return {
            card,
            options:
              card.kind === "tf-sort" || card.kind === "flash" || card.kind === "cloze" || card.kind === "match"
                ? []
                : card.kind === "multi"
                ? shuffleArr([...(card.answers ?? []), ...card.distractors])
                : shuffleArr([card.answer, ...card.distractors]),
            statementOrder,
          };
        });
        return preparedBatch;
      } catch (err) {
        console.error(err);
        return [];
      } finally {
        setLoadingDue(false);
      }
    },
    [cards]
  );

  useEffect(() => {
    if (!dueMode) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the first due-review batch asynchronously on mount
    loadDueBatch(new Set()).then((batch) => {
      setPrepared(batch);
      setSeenIds(new Set(batch.map((b) => b.card.id)));
    });
  }, [dueMode, loadDueBatch]);

  async function handleContinue() {
    const nextBatch = await loadDueBatch(seenIds);
    if (nextBatch.length === 0) {
      alert("No more cards to review!");
      finish(results);
      return;
    }
    setSeenIds((prev) => {
      const nextSet = new Set(prev);
      for (const b of nextBatch) nextSet.add(b.card.id);
      return nextSet;
    });
    const startOfNewBatch = prepared.length;
    setPrepared((prev) => [...prev, ...nextBatch]);
    setShowBatchPrompt(false);
    setIdx(startOfNewBatch);
  }

  const current = prepared[idx];
  const total = prepared.length;
  const isTfSort = current?.card.kind === "tf-sort" && !!current.card.statements;
  const isFlash = current?.card.kind === "flash";
  const isCloze = current?.card.kind === "cloze";
  const isMatch = current?.card.kind === "match";
  const isMulti = current?.card.kind === "multi";
  const multiCorrect = isMulti && gradeMulti(current!.card.answers ?? [], Array.from(multiPicked));
  const tfStatements = isTfSort ? current.card.statements! : [];
  const tfAllAssigned =
    isTfSort && tfStatements.every((_, i) => tfAssignments[i] === true || tfAssignments[i] === false);
  const tfAllCorrect =
    isTfSort && tfStatements.every((s, i) => tfAssignments[i] === s.isTrue);

  const clozeData = useMemo(() => {
    if (!isCloze || !current?.card.clozeText) return { segments: [], answers: [] };
    return parseCloze(current.card.clozeText);
  }, [isCloze, current]);

  const clozeAllCorrect = useMemo(() => {
    if (!isCloze) return false;
    const filled = clozeData.answers.map((_, i) => clozeInputs[i] ?? "");
    return gradeCloze(clozeData.answers, filled);
  }, [isCloze, clozeData, clozeInputs]);

  const matchAllMatched = isMatch && current?.card.pairs && matchedPairs.size === current.card.pairs.length;
  const matchAllCorrect = isMatch && matchMistakes === 0;

  const answered = isTfSort ? tfSubmitted : isFlash ? flipped : isCloze ? clozeSubmitted : isMatch ? !!matchAllMatched : isMulti ? multiSubmitted : picked !== null;

  // Reset per-card state on advance.
  useEffect(() => {
    startRef.current = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets per-card UI state when the card index changes
    setPicked(null);
    setTfAssignments({});
    setTfSubmitted(false);
    setTfFocus(0);
    setHintShown(false);
    setElapsed(0);
    setFlipped(false);
    setClozeInputs({});
    setClozeSubmitted(false);
    setClozeFocus(0);
    setSelectedLeft(null);
    setSelectedRight(null);
    setMatchedPairs(new Set());
    setMatchMistakes(0);
    setWrongPair(null);
    setMultiPicked(new Set());
    setMultiSubmitted(false);

    if (current?.card.kind === "match" && current.card.pairs) {
      const n = current.card.pairs.length;
      setLeftOrder(shuffleArr(Array.from({ length: n }, (_, i) => i)));
      setRightOrder(shuffleArr(Array.from({ length: n }, (_, i) => i)));
    }
  }, [idx, current]);

  // Live timer (stops once answered)
  useEffect(() => {
    if (picked || tfSubmitted || clozeSubmitted || matchAllMatched) return;
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 100);
    return () => clearInterval(t);
  }, [picked, tfSubmitted, clozeSubmitted, matchAllMatched, idx]);

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
        if (dueMode) {
          setShowBatchPrompt(true);
        } else {
          finish(nextResults);
        }
      } else {
        setIdx(idx + 1);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idx, total, results, current, dueMode]
  );

  const { handlers: swipeHandlers, dx: swipeDx } = useSwipe({
    onLeft: () => {
      if (isFlash && flipped) recordAndAdvance(1, "", false);
    },
    onRight: () => {
      if (isFlash && flipped) recordAndAdvance(3, "", true);
    },
    threshold: 80,
  });

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
      if (e.target && (e.target as HTMLElement).tagName === "INPUT") {
        if (isCloze && !answered && e.key === "Enter") {
          const allFilled = clozeData.answers.every((_, i) => (clozeInputs[i] ?? "").trim() !== "");
          if (allFilled) {
            e.preventDefault();
            setClozeSubmitted(true);
          }
        }
        return;
      }
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
        } else if (isFlash) {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            setFlipped(true);
          } else if (e.key.toLowerCase() === "h") {
            if (current.card.hint) {
              e.preventDefault();
              setHintShown((s) => !s);
            }
          }
        } else if (isCloze) {
          if (e.key === "Enter") {
            const allFilled = clozeData.answers.every((_, i) => (clozeInputs[i] ?? "").trim() !== "");
            if (allFilled) {
              e.preventDefault();
              setClozeSubmitted(true);
            }
          } else if (e.key.toLowerCase() === "h") {
            if (current.card.hint) {
              e.preventDefault();
              setHintShown((s) => !s);
            }
          } else if (e.key.toLowerCase() === "s") {
            e.preventDefault();
            const allFilled = clozeData.answers.every((_, i) => (clozeInputs[i] ?? "").trim() !== "");
            if (allFilled) setClozeSubmitted(true);
            else recordAndAdvance(1, "__skipped__");
          }
        } else if (isMatch) {
          if (e.key.toLowerCase() === "h") {
            if (current.card.hint) {
              e.preventDefault();
              setHintShown((s) => !s);
            }
          } else if (e.key.toLowerCase() === "s") {
            e.preventDefault();
            recordAndAdvance(1, "__skipped__");
          }
        } else if (isMulti) {
          if (e.key >= "1" && e.key <= "9") {
            const i = Number(e.key) - 1;
            if (i < current.options.length) {
              e.preventDefault();
              const opt = current.options[i];
              setMultiPicked((prev) => {
                const n = new Set(prev);
                if (n.has(opt)) n.delete(opt); else n.add(opt);
                return n;
              });
            }
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (multiPicked.size > 0) setMultiSubmitted(true);
          } else if (e.key.toLowerCase() === "h") {
            if (current.card.hint) {
              e.preventDefault();
              setHintShown((s) => !s);
            }
          } else if (e.key.toLowerCase() === "s") {
            e.preventDefault();
            if (multiPicked.size > 0) setMultiSubmitted(true);
            else recordAndAdvance(1, "__skipped__");
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
        if (isFlash) {
          const key = e.key.toLowerCase();
          if (e.key === "ArrowLeft" || key === "j" || e.key === "1") {
            e.preventDefault();
            recordAndAdvance(1, "", false);
          } else if (e.key === "ArrowRight" || key === "k" || e.key === "2" || e.key === "3") {
            e.preventDefault();
            recordAndAdvance(3, "", true);
          }
        } else if (e.key >= "1" && e.key <= "3") {
          e.preventDefault();
          if (isTfSort) {
            recordAndAdvance(Number(e.key) as Confidence, "", tfAllCorrect);
          } else if (isCloze) {
            recordAndAdvance(Number(e.key) as Confidence, "", clozeAllCorrect);
          } else if (isMatch) {
            recordAndAdvance(Number(e.key) as Confidence, "", matchAllCorrect);
          } else if (isMulti) {
            recordAndAdvance(Number(e.key) as Confidence, "", multiCorrect);
          } else if (picked) {
            recordAndAdvance(Number(e.key) as Confidence, picked);
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, picked, answered, isTfSort, tfAllCorrect, tfAssignments, tfFocus, recordAndAdvance, isFlash, flipped, isCloze, clozeData, clozeInputs, clozeAllCorrect, isMatch, matchAllCorrect, isMulti, multiPicked, multiCorrect]);

  if (dueMode && prepared.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 space-y-6 text-center">
        <Skeleton className="h-6 w-1/3 mx-auto" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <p className="text-sm text-zinc-500">Loading your review session…</p>
      </div>
    );
  }

  if (showBatchPrompt) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center space-y-6 animate-in fade-in duration-200">
        <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
          ✓
        </div>
        <div>
          <h2 className="text-xl font-bold">Batch complete!</h2>
          <p className="text-sm text-zinc-500 mt-1">
            You have reviewed {results.length} card{results.length === 1 ? "" : "s"} in this session.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={handleContinue}
            disabled={loadingDue}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium text-sm transition-colors shadow-sm"
          >
            {loadingDue ? "Loading…" : "Load 20 more"}
          </button>
          <button
            type="button"
            onClick={() => finish(results)}
            disabled={submitting}
            className="px-5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 text-zinc-800 dark:text-zinc-200 font-medium text-sm transition-colors"
          >
            {submitting ? "Saving…" : "Finish session"}
          </button>
        </div>
      </div>
    );
  }

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
        className="rounded-xl border border-border p-4 sm:p-6 bg-zinc-950/20 space-y-5 animate-in fade-in duration-200"
      >
        {!isFlash && !isCloze && !isMatch && (
          <h2 className="text-base sm:text-xl font-medium leading-relaxed">
            {current.card.question}
          </h2>
        )}

        <CardFrame url={current.card.source?.screenshotUrl} />

        {isFlash ? (
          <div 
            {...swipeHandlers}
            onClick={() => !flipped && setFlipped(true)}
            className="cursor-pointer select-none min-h-[220px] flex flex-col justify-between p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 relative overflow-hidden transition-transform active:scale-[0.99] duration-150"
            style={{
              transform: `translateX(${swipeDx}px) rotate(${swipeDx * 0.05}deg)`,
              transition: swipeDx === 0 ? "transform 0.2s ease" : "none",
            }}
          >
            {/* Swiping Indicator Overlays */}
            {swipeDx > 20 && (
              <div className="absolute top-4 right-4 bg-emerald-600/20 text-emerald-600 font-bold px-3 py-1 rounded text-xs uppercase tracking-widest border border-emerald-500/20 animate-in fade-in duration-100">
                Know ✓
              </div>
            )}
            {swipeDx < -20 && (
              <div className="absolute top-4 left-4 bg-rose-600/20 text-rose-600 font-bold px-3 py-1 rounded text-xs uppercase tracking-widest border border-rose-500/20 animate-in fade-in duration-100">
                Review ✕
              </div>
            )}

            {!flipped ? (
              <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4">
                <span className="text-sm text-zinc-500 font-medium">Question (Front)</span>
                <p className="text-lg sm:text-xl font-medium leading-relaxed">
                  {current.card.question}
                </p>
                <div className="text-xs text-zinc-400 dark:text-zinc-500 bg-zinc-200/50 dark:bg-zinc-800/50 px-2 py-1 rounded">
                  Tap card or press <kbd className="font-mono">Space</kbd> to flip
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <span className="text-sm text-zinc-500 font-medium">Answer (Back)</span>
                  <p className="text-lg sm:text-xl font-medium leading-relaxed text-indigo-600 dark:text-indigo-400">
                    {current.card.answer}
                  </p>
                </div>
                {current.card.explanation && (
                  <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
                    <span className="text-xs uppercase tracking-wider text-zinc-400">Explanation</span>
                    <p className="text-sm leading-relaxed mt-1 text-zinc-700 dark:text-zinc-300">
                      {current.card.explanation}
                    </p>
                  </div>
                )}

                <div className="flex gap-3 pt-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      recordAndAdvance(1, "", false);
                    }}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 dark:border-rose-950/60 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
                  >
                    Review again ✕
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      recordAndAdvance(3, "", true);
                    }}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-950/60 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
                  >
                    Know it ✓
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : isMatch ? (
          <div className="space-y-4">
            <style>{`
              @keyframes match-shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-4px); }
                75% { transform: translateX(4px); }
              }
              .animate-match-shake {
                animation: match-shake 0.2s ease-in-out 2;
              }
            `}</style>
            <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
              Tap a left element, then a right element to pair them:
            </p>
            <div className="grid grid-cols-2 gap-4">
              {/* Left Column */}
              <div className="space-y-2">
                {leftOrder.map((pairIdx) => {
                  const p = current.card.pairs![pairIdx];
                  const isMatched = matchedPairs.has(pairIdx);
                  const isSelected = selectedLeft === pairIdx;
                  const isWrong = wrongPair && wrongPair[0] === pairIdx;

                  return (
                    <button
                      key={pairIdx}
                      type="button"
                      disabled={isMatched || !!wrongPair}
                      onClick={() => {
                        if (selectedLeft === pairIdx) {
                          setSelectedLeft(null);
                          return;
                        }
                        setSelectedLeft(pairIdx);
                        if (selectedRight !== null) {
                          const rIdx = selectedRight;
                          if (pairIdx === rIdx) {
                            setMatchedPairs((s) => {
                              const n = new Set(s);
                              n.add(pairIdx);
                              return n;
                            });
                          } else {
                            setMatchMistakes((m) => m + 1);
                            setWrongPair([pairIdx, rIdx]);
                            setTimeout(() => setWrongPair(null), 800);
                          }
                          setSelectedLeft(null);
                          setSelectedRight(null);
                        }
                      }}
                      className={[
                        "w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all focus:outline-none focus:ring-2 select-none",
                        isMatched && "border-emerald-500 bg-emerald-50/40 text-emerald-800 dark:text-emerald-300 dark:border-emerald-950 font-medium opacity-60 cursor-default",
                        isWrong && "border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 animate-match-shake",
                        isSelected && !isMatched && !isWrong && "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-indigo-200 dark:ring-indigo-900 text-indigo-900 dark:text-indigo-100",
                        !isMatched && !isSelected && !isWrong && "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 text-zinc-800 dark:text-zinc-200",
                      ].filter(Boolean).join(" ")}
                    >
                      {p.left}
                    </button>
                  );
                })}
              </div>

              {/* Right Column */}
              <div className="space-y-2">
                {rightOrder.map((pairIdx) => {
                  const p = current.card.pairs![pairIdx];
                  const isMatched = matchedPairs.has(pairIdx);
                  const isSelected = selectedRight === pairIdx;
                  const isWrong = wrongPair && wrongPair[1] === pairIdx;

                  return (
                    <button
                      key={pairIdx}
                      type="button"
                      disabled={isMatched || !!wrongPair}
                      onClick={() => {
                        if (selectedRight === pairIdx) {
                          setSelectedRight(null);
                          return;
                        }
                        setSelectedRight(pairIdx);
                        if (selectedLeft !== null) {
                          const lIdx = selectedLeft;
                          if (lIdx === pairIdx) {
                            setMatchedPairs((s) => {
                              const n = new Set(s);
                              n.add(pairIdx);
                              return n;
                            });
                          } else {
                            setMatchMistakes((m) => m + 1);
                            setWrongPair([lIdx, pairIdx]);
                            setTimeout(() => setWrongPair(null), 800);
                          }
                          setSelectedLeft(null);
                          setSelectedRight(null);
                        }
                      }}
                      className={[
                        "w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all focus:outline-none focus:ring-2 select-none",
                        isMatched && "border-emerald-500 bg-emerald-50/40 text-emerald-800 dark:text-emerald-300 dark:border-emerald-950 font-medium opacity-60 cursor-default",
                        isWrong && "border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 animate-match-shake",
                        isSelected && !isMatched && !isWrong && "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-indigo-200 dark:ring-indigo-900 text-indigo-900 dark:text-indigo-100",
                        !isMatched && !isSelected && !isWrong && "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 text-zinc-800 dark:text-zinc-200",
                      ].filter(Boolean).join(" ")}
                    >
                      {p.right}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : isCloze ? (
          <div className="space-y-5">
            <div className="leading-relaxed text-base sm:text-lg">
              {clozeData.segments.map((seg, j) => {
                const hasInput = j < clozeData.answers.length;
                if (!hasInput) {
                  return <span key={j}>{seg}</span>;
                }
                const correctVal = clozeData.answers[j];
                const userVal = clozeInputs[j] ?? "";
                const isCorrect = userVal.trim().toLowerCase() === correctVal.toLowerCase();
                return (
                  <span key={j} className="inline-flex items-baseline gap-1 flex-wrap">
                    <span>{seg}</span>
                    <input
                      type="text"
                      disabled={clozeSubmitted}
                      value={userVal}
                      onChange={(e) =>
                        setClozeInputs((m) => ({ ...m, [j]: e.target.value }))
                      }
                      className={[
                        "px-2 py-0.5 mx-1 rounded border text-sm font-medium transition-colors w-28 sm:w-36 focus:outline-none focus:ring-2",
                        !clozeSubmitted && "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:border-indigo-500 focus:ring-indigo-200 dark:focus:ring-indigo-900",
                        clozeSubmitted && isCorrect && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-semibold",
                        clozeSubmitted && !isCorrect && "border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 font-semibold line-through",
                      ].filter(Boolean).join(" ")}
                      placeholder="???"
                    />
                    {clozeSubmitted && !isCorrect && (
                      <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-semibold border border-emerald-200 dark:border-emerald-900 animate-in fade-in duration-200">
                        {correctVal}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>

            {!clozeSubmitted && (
              <button
                type="button"
                onClick={() => setClozeSubmitted(true)}
                disabled={clozeData.answers.length === 0}
                className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                Submit
              </button>
            )}
          </div>
        ) : isTfSort ? (
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
        ) : isMulti ? (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
              Select all that apply
            </p>
            <div className="grid sm:grid-cols-2 gap-2 sm:gap-2.5">
              {current.options.map((opt, i) => {
                const isCorrect = (current.card.answers ?? []).includes(opt);
                const isPicked = multiPicked.has(opt);
                const showResult = multiSubmitted;
                return (
                  <button
                    key={opt}
                    onClick={() => {
                      if (multiSubmitted) return;
                      setMultiPicked((prev) => {
                        const n = new Set(prev);
                        if (n.has(opt)) n.delete(opt); else n.add(opt);
                        return n;
                      });
                    }}
                    disabled={showResult}
                    className={[
                      "group text-left px-4 py-3 rounded-lg border transition-all flex items-start gap-3",
                      !showResult && isPicked && "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-indigo-200 dark:ring-indigo-900",
                      !showResult && !isPicked && "border-zinc-300 dark:border-zinc-700 hover:border-indigo-500 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20",
                      showResult && isCorrect && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60",
                      showResult && !isCorrect && isPicked && "border-rose-500 bg-rose-50 dark:bg-rose-950/60",
                      showResult && !isCorrect && !isPicked && "border-zinc-200 dark:border-zinc-800 opacity-50",
                    ].filter(Boolean).join(" ")}
                  >
                    <span
                      className={[
                        "shrink-0 w-6 h-6 inline-flex items-center justify-center rounded border text-xs font-mono font-semibold",
                        !showResult && isPicked && "bg-indigo-600 border-indigo-600 text-white",
                        !showResult && !isPicked && "border-zinc-300 dark:border-zinc-600 text-transparent",
                        showResult && isCorrect && "bg-emerald-600 border-emerald-600 text-white",
                        showResult && !isCorrect && isPicked && "bg-rose-600 border-rose-600 text-white",
                        showResult && !isCorrect && !isPicked && "border-zinc-300 dark:border-zinc-700 text-transparent",
                      ].filter(Boolean).join(" ")}
                    >
                      ✓
                    </span>
                    <span className="flex-1">{opt}</span>
                    <kbd className="shrink-0 text-[10px] text-zinc-400 font-mono">{i + 1}</kbd>
                  </button>
                );
              })}
            </div>
            {!multiSubmitted && (
              <button
                type="button"
                onClick={() => setMultiSubmitted(true)}
                disabled={multiPicked.size === 0}
                className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                Submit ({multiPicked.size} selected)
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
        {answered && !isFlash && (() => {
          const cardCorrect = isTfSort
            ? tfAllCorrect
            : isCloze
            ? clozeAllCorrect
            : isMatch
            ? matchAllCorrect
            : isMulti
            ? multiCorrect
            : picked === current.card.answer;
          const tfCorrectCount = isTfSort
            ? tfStatements.filter((s, i) => tfAssignments[i] === s.isTrue).length
            : 0;
          const clozeCorrectCount = isCloze
            ? clozeData.answers.filter(
                (a, i) => (clozeInputs[i] ?? "").trim().toLowerCase() === a.toLowerCase()
              ).length
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
              {isCloze && (
                <span className="text-zinc-500">
                  · {clozeCorrectCount}/{clozeData.answers.length} blanks correct
                </span>
              )}
              {isMatch && (
                <span className="text-zinc-500">
                  · completed with {matchMistakes} mistake{matchMistakes === 1 ? "" : "s"}
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
                        : isCloze
                        ? recordAndAdvance(c, "", clozeAllCorrect)
                        : isMatch
                        ? recordAndAdvance(c, "", matchAllCorrect)
                        : isMulti
                        ? recordAndAdvance(c, "", multiCorrect)
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
            ) : isFlash ? (
              <span>
                <Kbd>Space</Kbd>/<Kbd>Enter</Kbd> flip
              </span>
            ) : isCloze ? (
              <span>
                <Kbd>Tab</Kbd> move · <Kbd>Enter</Kbd> submit
              </span>
            ) : isMatch ? (
              <span>
                Tap pairs to match
              </span>
            ) : isMulti ? (
              <span>
                <Kbd>1</Kbd>–<Kbd>9</Kbd> toggle · <Kbd>Enter</Kbd> submit
              </span>
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
              <Kbd>S</Kbd> {isTfSort || isCloze ? "submit" : "skip"}
            </span>
          </>
        ) : (
          isFlash ? (
            <span>
              <Kbd>←</Kbd>/<Kbd>J</Kbd> review again · <Kbd>→</Kbd>/<Kbd>K</Kbd> know it
            </span>
          ) : (
            <span>
              <Kbd>1</Kbd>/<Kbd>2</Kbd>/<Kbd>3</Kbd> rate confidence & continue
            </span>
          )
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
