"use client";

import Link from "next/link";
import type { Card, Tag } from "@/types";
import { isVideoSource } from "@/lib/source";
import { CardKindBadge } from "@/components/CardKindBadge";
import { Markdown } from "@/components/Markdown";
import { parseCloze } from "@/lib/cloze";

function formatTimestamp(seconds: number): string {
  const totalSec = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${mins}:${pad(secs)}`;
}

export function NotesSlideCard({
  card,
  tagById,
  onToggleBookmark,
  compact = false,
  searchQuery = "",
}: {
  card: Card;
  tagById: Map<string, Tag>;
  onToggleBookmark?: (cardId: string, current: boolean) => void;
  compact?: boolean;
  searchQuery?: string;
}) {
  const videoSource = isVideoSource(card.source) ? card.source : null;
  const screenshotUrl = card.source?.screenshotUrl;
  const extraImages = Array.isArray(card.referenceImages) ? card.referenceImages : [];
  const allImages = [screenshotUrl, ...extraImages].filter((u): u is string => typeof u === "string" && !!u);

  const targetSec = Math.floor(videoSource?.timestamp ?? 0);
  const ytUrl = videoSource
    ? `https://www.youtube.com/watch?v=${videoSource.videoId}&t=${targetSec}s`
    : "";

  return (
    <div className="rounded-xl border border-border bg-zinc-950/30 overflow-hidden space-y-4 p-4 sm:p-6 shadow-sm">
      {/* 1. Direct Screenshot Visualization */}
      {allImages.length > 0 && (
        <div className="space-y-2">
          {allImages.map((imgUrl, i) => (
            <div key={i} className="rounded-lg border border-border overflow-hidden bg-black/50">
              <img
                src={imgUrl}
                loading="lazy"
                alt={`Lecture Frame ${i + 1}`}
                className="w-full max-h-[500px] object-contain block mx-auto"
              />
            </div>
          ))}
        </div>
      )}

      {/* 2. Question / Topic Heading */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="text-base sm:text-xl font-bold leading-relaxed text-foreground">
            <Markdown text={card.question} highlightQuery={searchQuery} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
              D{card.difficulty}
            </span>
            {onToggleBookmark && (
              <button
                type="button"
                onClick={() => onToggleBookmark(card.id, !!card.bookmarked)}
                className={[
                  "text-base transition-colors focus:outline-none cursor-pointer",
                  card.bookmarked
                    ? "text-amber-500 hover:text-amber-600 font-semibold"
                    : "text-zinc-600 hover:text-zinc-400",
                ].join(" ")}
                title={card.bookmarked ? "Unbookmark note" : "Bookmark note"}
              >
                {card.bookmarked ? "★" : "☆"}
              </button>
            )}
          </div>
        </div>

        {/* 3. Card Kind Specific Content */}
        <div className="space-y-2 text-sm text-zinc-300">
          {card.kind === "tf-sort" && card.statements ? (
            <ul className="space-y-1.5 p-3 rounded bg-black/40 border border-border/50">
              {card.statements.map((s, idx) => (
                <li key={idx} className="flex gap-2.5 items-baseline">
                  <span
                    className={
                      s.isTrue
                        ? "text-emerald-400 font-bold text-xs uppercase px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-900 shrink-0"
                        : "text-rose-400 font-bold text-xs uppercase px-1.5 py-0.5 rounded bg-rose-950/60 border border-rose-900 shrink-0"
                    }
                  >
                    {s.isTrue ? "True" : "False"}
                  </span>
                  <div className="flex-1">
                    <Markdown text={s.text} inline highlightQuery={searchQuery} />
                  </div>
                </li>
              ))}
            </ul>
          ) : card.kind === "cloze" && card.clozeText ? (
            <div className="p-3 rounded bg-black/40 border border-border/50 leading-relaxed text-sm">
              {(() => {
                const { segments, answers } = parseCloze(card.clozeText!);
                return segments.map((seg, j) => (
                  <span key={j}>
                    <Markdown text={seg} inline highlightQuery={searchQuery} />
                    {j < answers.length && (
                      <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 font-semibold mx-1 border border-emerald-800 text-xs">
                        <Markdown text={answers[j]} inline highlightQuery={searchQuery} />
                      </span>
                    )}
                  </span>
                ));
              })()}
            </div>
          ) : card.kind === "match" && card.pairs ? (
            <ul className="space-y-1.5 p-3 rounded bg-black/40 border border-border/50">
              {card.pairs.map((p, idx) => (
                <li key={idx} className="flex gap-2 items-center text-xs">
                  <Markdown text={p.left} className="font-semibold text-zinc-200 inline-block" highlightQuery={searchQuery} />
                  <span className="text-muted">➔</span>
                  <Markdown text={p.right} className="text-emerald-400 font-medium inline-block" highlightQuery={searchQuery} />
                </li>
              ))}
            </ul>
          ) : card.kind === "multi" && card.answers ? (
            <div className="p-3 rounded bg-black/40 border border-border/50 space-y-1.5">
              <div className="text-xs font-bold uppercase tracking-wider text-muted">Correct Answers:</div>
              <div className="flex flex-wrap gap-1.5">
                {card.answers.map((ans, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-1 rounded bg-emerald-950/60 text-emerald-300 text-xs font-medium border border-emerald-800"
                  >
                    <Markdown text={ans} inline highlightQuery={searchQuery} />
                  </span>
                ))}
              </div>
            </div>
          ) : (
            card.answer && (
              <div className="p-3 rounded bg-black/40 border border-border/50 space-y-1">
                <div className="text-[10px] uppercase font-bold tracking-wider text-muted">
                  {card.kind === "flash" ? "Answer / Notes" : "Correct Answer"}
                </div>
                <div className="text-sm leading-relaxed text-indigo-300 font-medium">
                  <Markdown text={card.answer} highlightQuery={searchQuery} />
                </div>
              </div>
            )
          )}

          {card.explanation && (
            <div className="p-3 rounded bg-zinc-900/50 border border-border/40 space-y-1">
              <div className="text-[10px] uppercase font-bold tracking-wider text-muted">Explanation</div>
              <div className="text-xs leading-relaxed text-zinc-300">
                <Markdown text={card.explanation} highlightQuery={searchQuery} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Footer Metadata & Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-border/40 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <CardKindBadge kind={card.kind} />
          {videoSource && (
            <a
              href={ytUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold transition-colors no-underline text-xs"
              title="Open video on YouTube at this exact timestamp"
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
              YouTube ({formatTimestamp(videoSource.timestamp)})
            </a>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-wrap gap-1">
            {card.tags.map((tid) => {
              const t = tagById.get(tid);
              return t ? (
                <span key={tid} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300">
                  #{t.name}
                </span>
              ) : null;
            })}
          </div>

          <Link
            href={`/cards/${card.id}/edit`}
            className="text-xs text-accent hover:underline font-bold uppercase tracking-wider whitespace-nowrap"
          >
            ✎ Edit
          </Link>
        </div>
      </div>
    </div>
  );
}
