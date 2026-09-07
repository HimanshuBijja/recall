"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Card, Tag } from "@/types";
import type { NoteBook } from "@/types/notes";
import type { ChapterCardItem } from "@/app/notes/[id]/page";
import { matchesCardQuery, getMatchedSnippet } from "@/lib/search";
import { CardKindBadge } from "@/components/CardKindBadge";
import { isVideoSource } from "@/lib/source";

function formatTimestamp(seconds: number): string {
  const totalSec = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hrs > 0) return `${hrs}:${pad(mins)}:${pad(secs)}`;
  return `${mins}:${pad(secs)}`;
}

export interface SearchResultCardItem {
  card: Card;
  chapterNum?: number;
  groupName?: string;
  notebookName?: string;
  notebookId?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onApplySearchFilter: (query: string) => void;
  currentNotebook?: NoteBook;
  chapterCards?: ChapterCardItem[];
  allNotebooks?: NoteBook[];
  allCards?: Card[];
  tags: Tag[];
  initialQuery?: string;
}

export function NotesSearchModal({
  isOpen,
  onClose,
  onApplySearchFilter,
  currentNotebook,
  chapterCards = [],
  allNotebooks = [],
  allCards = [],
  tags,
  initialQuery = "",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [scope, setScope] = useState<"notebook" | "all">(
    currentNotebook ? "notebook" : "all"
  );
  const [selectedIndex, setSelectedIndex] = useState(0);

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const notebookMap = useMemo(
    () => new Map(allNotebooks.map((n) => [n.id, n])),
    [allNotebooks]
  );

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialQuery]);

  // Compute search results based on active scope
  const results = useMemo<SearchResultCardItem[]>(() => {
    if (!query.trim()) return [];
    const q = query.trim();

    if (scope === "notebook" && chapterCards.length > 0) {
      const matched: SearchResultCardItem[] = [];
      for (const item of chapterCards) {
        if (matchesCardQuery(item.card, q, tagById)) {
          matched.push({
            card: item.card,
            chapterNum: item.chapterNum,
            groupName: item.groupName,
            notebookName: currentNotebook?.name,
            notebookId: currentNotebook?.id,
          });
        }
      }
      return matched;
    } else {
      // Global search across all cards/notebooks
      const matched: SearchResultCardItem[] = [];

      // Build group to notebook lookup map
      const groupToNotebooks = new Map<string, NoteBook[]>();
      for (const n of allNotebooks) {
        for (const gid of n.groupIds) {
          const list = groupToNotebooks.get(gid) ?? [];
          list.push(n);
          groupToNotebooks.set(gid, list);
        }
      }

      for (const c of allCards) {
        if (matchesCardQuery(c, q, tagById)) {
          // Find associated notebook if available
          matched.push({
            card: c,
            notebookName: "Global Library",
          });
        }
      }
      return matched;
    }
  }, [query, scope, chapterCards, currentNotebook, allCards, allNotebooks, tagById]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length]);

  // Auto-scroll selected item into view inside the list
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.children[selectedIndex] as HTMLElement;
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (query.trim()) {
        onApplySearchFilter(query.trim());
        onClose();
      }
    }
  }

  function handleSelectResult(item: SearchResultCardItem) {
    if (query.trim()) {
      onApplySearchFilter(query.trim());
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center p-4 pt-16 sm:pt-24"
      onClick={onClose}
    >
      <div
        className="cinematic-editor-panel max-w-2xl w-full max-h-[80vh] flex flex-col space-y-4 animate-in fade-in zoom-in-95 duration-150 shadow-2xl border border-zinc-700 bg-[#141416]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Top Header & Search Input */}
        <div className="space-y-3 pb-3 border-b border-border/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              Master Notes Search
            </div>

            {/* Scope Switcher Pill */}
            {currentNotebook && (
              <div className="flex items-center rounded border border-border bg-black/40 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setScope("notebook")}
                  className={[
                    "px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer",
                    scope === "notebook"
                      ? "bg-accent text-background"
                      : "text-muted hover:text-foreground",
                  ].join(" ")}
                >
                  This Notebook
                </button>
                <button
                  type="button"
                  onClick={() => setScope("all")}
                  className={[
                    "px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer",
                    scope === "all"
                      ? "bg-accent text-background"
                      : "text-muted hover:text-foreground",
                  ].join(" ")}
                >
                  All Notebooks
                </button>
              </div>
            )}
          </div>

          {/* Search Box */}
          <div className="relative flex items-center">
            <span className="absolute left-3.5 text-muted text-sm select-none">🔍</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                scope === "notebook" && currentNotebook
                  ? `Search inside "${currentNotebook.name}"… (e.g. Cardinality, FD, Subnet)`
                  : "Search across all notes content…"
              }
              className="w-full pl-10 pr-10 py-3 rounded-[4px] border border-border/80 bg-black/60 text-foreground placeholder-zinc-500 text-sm focus:outline-none focus:border-accent"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 text-xs text-muted hover:text-foreground font-bold p-1"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Results Body */}
        <div ref={listRef} className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
          {!query.trim() ? (
            <div className="py-12 text-center text-xs text-muted space-y-2">
              <p className="font-semibold text-zinc-400">Type keywords to search slide cards, formulas, notes, and topics.</p>
              <p className="text-[11px] text-zinc-500 font-mono">
                Press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-sans">Enter</kbd> to filter the deck to matching slides (Topic Study Mode).
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted">
              No notes match <span className="text-accent font-mono">"{query}"</span> in {scope === "notebook" ? "this notebook" : "all notebooks"}.
            </div>
          ) : (
            results.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const { field, snippet } = getMatchedSnippet(item.card, query, tagById);
              const videoSrc = isVideoSource(item.card.source) ? item.card.source : null;
              const thumb = item.card.source?.screenshotUrl ?? item.card.referenceImages?.[0];

              return (
                <div
                  key={item.card.id}
                  onClick={() => handleSelectResult(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={[
                    "p-3 rounded border transition-all cursor-pointer flex gap-3 items-start select-none",
                    isSelected
                      ? "border-accent bg-zinc-900 ring-1 ring-accent"
                      : "border-border/60 bg-black/40 hover:bg-zinc-900/50",
                  ].join(" ")}
                >
                  {/* Thumbnail */}
                  {thumb ? (
                    <img
                      src={thumb}
                      alt="Slide preview"
                      className="w-16 h-12 object-cover rounded border border-border/80 shrink-0 bg-black"
                    />
                  ) : (
                    <div className="w-16 h-12 rounded border border-border/60 bg-zinc-900 flex items-center justify-center text-[9px] font-mono text-zinc-500 shrink-0">
                      Slide
                    </div>
                  )}

                  {/* Card Content & Metadata */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.chapterNum && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/20 text-accent border border-accent/30">
                            Ch {item.chapterNum}
                          </span>
                        )}
                        {item.groupName && (
                          <span className="text-[10px] font-bold text-foreground truncate max-w-[200px]">
                            {item.groupName}
                          </span>
                        )}
                        <CardKindBadge kind={item.card.kind} />
                      </div>

                      {videoSrc && typeof videoSrc.timestamp === "number" && (
                        <span className="text-[9px] font-mono text-red-400 bg-red-950/40 px-1.5 py-0.5 rounded border border-red-900/50 shrink-0">
                          ▶ {formatTimestamp(videoSrc.timestamp)}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-zinc-200 font-medium line-clamp-2 leading-relaxed">
                      <span className="text-[10px] font-mono text-accent uppercase font-bold mr-1.5">
                        [{field}]:
                      </span>
                      {snippet}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Actions Footer */}
        <div className="pt-3 border-t border-border/80 flex items-center justify-between text-[11px] font-mono text-muted">
          <div>
            {results.length > 0 && (
              <span>
                <strong className="text-accent">{results.length}</strong> matching slide{results.length === 1 ? "" : "s"} found
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-sans text-[10px]">↑</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-sans text-[10px] ml-0.5">↓</kbd> navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-sans text-[10px]">↵ Filter Deck</kbd>
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-sans text-[10px]">Esc Close</kbd>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
