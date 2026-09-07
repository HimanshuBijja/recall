"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Card, Tag } from "@/types";
import { NotesSlideCard } from "@/components/NotesSlideCard";
import { KIND_CONFIG } from "@/app/groups/[id]/GroupDetailClient";
import { api } from "@/lib/api";

const ALL_KINDS = ["mcq", "multi", "flash", "cloze", "tf-sort", "match"];
const STORAGE_KINDS_KEY = "recall_notes_kind_filters";
const STORAGE_MODE_KEY = "recall_notes_view_mode";

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

export function NotesReaderClient({
  title,
  subTitle,
  initialCards,
  tags,
}: {
  title: string;
  subTitle: string;
  initialCards: Card[];
  tags: Tag[];
}) {
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [viewMode, setViewMode] = useState<"slide" | "scroll">("slide");
  const [selectedKinds, setSelectedKinds] = useState<string[]>(ALL_KINDS);
  const [slideIdx, setSlideIdx] = useState(0);

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  // Restore LocalStorage filters on mount
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem(STORAGE_MODE_KEY);
      if (savedMode === "slide" || savedMode === "scroll") {
        setViewMode(savedMode);
      }
      const savedKinds = localStorage.getItem(STORAGE_KINDS_KEY);
      if (savedKinds) {
        const parsed = JSON.parse(savedKinds);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSelectedKinds(parsed);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Update LocalStorage on filter/mode changes
  function toggleKind(kind: string) {
    setSelectedKinds((prev) => {
      const next = prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind];
      try {
        localStorage.setItem(STORAGE_KINDS_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  }

  function changeViewMode(mode: "slide" | "scroll") {
    setViewMode(mode);
    try {
      localStorage.setItem(STORAGE_MODE_KEY, mode);
    } catch { /* ignore */ }
  }

  const filteredCards = useMemo(() => {
    return cards.filter((c) => selectedKinds.includes(c.kind || "mcq"));
  }, [cards, selectedKinds]);

  const currentCard = filteredCards[slideIdx] ?? filteredCards[0];

  // Reset slide index if bounds exceeded
  useEffect(() => {
    if (slideIdx >= filteredCards.length && filteredCards.length > 0) {
      setSlideIdx(0);
    }
  }, [filteredCards.length, slideIdx]);

  // Keyboard navigation for Slide Deck mode
  useEffect(() => {
    if (viewMode !== "slide" || filteredCards.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "ArrowLeft" || (e.shiftKey && e.key === " ")) {
        e.preventDefault();
        setSlideIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setSlideIdx((i) => Math.min(filteredCards.length - 1, i + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewMode, filteredCards.length]);

  async function handleToggleBookmark(cardId: string, currentVal: boolean) {
    const nextVal = !currentVal;
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, bookmarked: nextVal } : c))
    );
    try {
      await api.patch(`/cards/${cardId}`, { bookmarked: nextVal });
    } catch {
      setCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, bookmarked: currentVal } : c))
      );
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 text-xs tracking-widest text-muted uppercase font-semibold mb-2">
            <span className="w-6 h-[2px] bg-accent" />
            Notebook Reader
          </div>
          <h1 className="cinematic-headline text-[8vw] sm:text-[6vw] md:text-[4vw] leading-[0.85] font-display font-bold tracking-tight mb-1" data-text={title}>
            {title}
          </h1>
          <p className="text-xs text-muted font-mono mt-1">{subTitle}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/notes"
            className="px-4 py-2 border border-border hover:bg-zinc-900 text-foreground font-bold text-xs uppercase tracking-widest transition-colors duration-150 rounded-[4px] no-underline"
          >
            ← Notes Library
          </Link>

          {/* View Mode Toggle */}
          <div className="flex items-center rounded-[4px] border border-border bg-black/40 p-0.5">
            <button
              type="button"
              onClick={() => changeViewMode("slide")}
              className={[
                "px-3 py-1.5 rounded-[4px] text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer",
                viewMode === "slide"
                  ? "bg-accent text-background"
                  : "text-muted hover:text-foreground",
              ].join(" ")}
            >
              🖼 Slide Deck
            </button>
            <button
              type="button"
              onClick={() => changeViewMode("scroll")}
              className={[
                "px-3 py-1.5 rounded-[4px] text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer",
                viewMode === "scroll"
                  ? "bg-accent text-background"
                  : "text-muted hover:text-foreground",
              ].join(" ")}
            >
              📜 Continuous Feed
            </button>
          </div>
        </div>
      </div>

      <hr className="border-t border-divider my-6" />

      {/* Card Kind Filter Bar (Persisted in LocalStorage) */}
      <div className="flex items-center gap-3 bg-zinc-950/20 border border-border p-3 rounded-[4px] flex-wrap">
        <span className="text-xs uppercase font-bold tracking-wider text-muted">Card Type Filter:</span>
        <div className="flex items-center gap-2 flex-wrap">
          {ALL_KINDS.map((k) => {
            const isSelected = selectedKinds.includes(k);
            const config = KIND_CONFIG[k] || { label: k.toUpperCase(), activeClass: "bg-indigo-600 border-indigo-600 text-white" };
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleKind(k)}
                className={[
                  "px-2.5 py-1 rounded-[4px] border text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer",
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
        <span className="text-xs font-mono text-muted ml-auto">
          {filteredCards.length} of {cards.length} notes active
        </span>
      </div>

      {/* Reader Views */}
      {filteredCards.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center text-sm text-muted rounded-[4px] bg-zinc-950/10">
          No notes match the selected card type filters.
        </div>
      ) : viewMode === "slide" ? (
        /* SLIDE DECK MODE (HORIZONTAL) */
        <div className="space-y-4 max-w-4xl mx-auto">
          {/* Top Slide Control Bar */}
          <div className="flex items-center justify-between text-xs font-mono text-muted bg-zinc-950/40 border border-border p-2.5 rounded-[4px]">
            <button
              type="button"
              disabled={slideIdx === 0}
              onClick={() => setSlideIdx((i) => Math.max(0, i - 1))}
              className="px-3 py-1.5 rounded border border-border hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed font-bold uppercase tracking-wider"
            >
              ← Previous
            </button>
            <span className="font-bold text-accent">
              Slide {slideIdx + 1} of {filteredCards.length}
            </span>
            <button
              type="button"
              disabled={slideIdx === filteredCards.length - 1}
              onClick={() => setSlideIdx((i) => Math.min(filteredCards.length - 1, i + 1))}
              className="px-3 py-1.5 rounded border border-border hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed font-bold uppercase tracking-wider"
            >
              Next →
            </button>
          </div>

          {/* Slide Deck Card */}
          {currentCard && (
            <NotesSlideCard
              key={currentCard.id}
              card={currentCard}
              tagById={tagById}
              onToggleBookmark={handleToggleBookmark}
            />
          )}

          {/* Bottom Thumbnail Strip Navigator */}
          {filteredCards.length > 1 && (
            <div className="space-y-2 pt-2">
              <div className="text-[10px] uppercase font-bold tracking-wider text-muted">Jump to slide:</div>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {filteredCards.map((c, i) => {
                  const isSelected = i === slideIdx;
                  const thumb = c.source?.screenshotUrl ?? c.referenceImages?.[0];
                  const ts = c.source?.timestamp;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSlideIdx(i)}
                      className={[
                        "shrink-0 w-24 rounded border p-1 text-left flex flex-col justify-between gap-1 transition-all cursor-pointer",
                        isSelected
                          ? "border-accent bg-zinc-900 ring-1 ring-accent"
                          : "border-border/60 bg-black/40 hover:border-zinc-500",
                      ].join(" ")}
                    >
                      {thumb ? (
                        <img src={thumb} loading="lazy" alt={`Slide ${i + 1}`} className="w-full h-12 object-cover rounded" />
                      ) : (
                        <div className="w-full h-12 bg-zinc-900 rounded flex items-center justify-center text-[10px] text-zinc-500 font-mono">
                          Slide {i + 1}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[9px] font-mono text-muted">
                        <span>#{i + 1}</span>
                        {typeof ts === "number" && <span>{formatTimestamp(ts)}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* CONTINUOUS FEED MODE (VERTICAL) */
        <div className="space-y-6 max-w-4xl mx-auto">
          {filteredCards.map((c) => (
            <NotesSlideCard
              key={c.id}
              card={c}
              tagById={tagById}
              onToggleBookmark={handleToggleBookmark}
            />
          ))}
        </div>
      )}
    </div>
  );
}
