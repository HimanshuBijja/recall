"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Card, Tag } from "@/types";
import type { NoteBook } from "@/types/notes";
import type { ChapterCardItem } from "./page";
import { NotesSlideCard } from "@/components/NotesSlideCard";
import { KIND_CONFIG } from "@/app/groups/[id]/GroupDetailClient";
import { api } from "@/lib/api";
import { NotesSearchModal } from "@/components/NotesSearchModal";
import { matchesCardQuery } from "@/lib/search";

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
  notebook,
  chapterCards: initialChapterCards,
  chaptersSummary,
  tags,
}: {
  notebook: NoteBook;
  chapterCards: ChapterCardItem[];
  chaptersSummary: { chapterNum: number; groupId: string; groupName: string; startIndex: number }[];
  tags: Tag[];
}) {
  const searchParams = useSearchParams();
  const startChapterParam = searchParams.get("startChapter");
  const initialSearchParam = searchParams.get("search") || "";

  const [chapterCards, setChapterCards] = useState<ChapterCardItem[]>(initialChapterCards);
  const [viewMode, setViewMode] = useState<"slide" | "scroll">("slide");
  const [selectedKinds, setSelectedKinds] = useState<string[]>(ALL_KINDS);
  const [slideIdx, setSlideIdx] = useState(0);
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState(initialSearchParam);
  const [showSearchModal, setShowSearchModal] = useState(false);

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  // Ctrl+K key binding to toggle search modal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowSearchModal((s) => !s);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filteredChaptersSummary = useMemo(() => {
    if (!drawerSearch.trim()) return chaptersSummary;
    const q = drawerSearch.toLowerCase();
    return chaptersSummary.filter(
      (ch) => ch.groupName.toLowerCase().includes(q) || String(ch.chapterNum).includes(q)
    );
  }, [chaptersSummary, drawerSearch]);

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

  // Handle startChapter URL param jump
  useEffect(() => {
    if (startChapterParam) {
      const chIdx = Number(startChapterParam);
      if (!isNaN(chIdx) && chIdx >= 0 && chIdx < chaptersSummary.length) {
        setSlideIdx(chaptersSummary[chIdx].startIndex);
      }
    }
  }, [startChapterParam, chaptersSummary]);

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

  const filteredItems = useMemo(() => {
    return chapterCards.filter((item) => {
      const matchesKind = selectedKinds.includes(item.card.kind || "mcq");
      if (!matchesKind) return false;
      if (!searchQuery.trim()) return true;
      return matchesCardQuery(item.card, searchQuery, tagById);
    });
  }, [chapterCards, selectedKinds, searchQuery, tagById]);

  // Reset slide index to 0 when search query changes
  function applySearchQuery(query: string) {
    setSearchQuery(query);
    setSlideIdx(0);
  }

  const currentItem = filteredItems[slideIdx] ?? filteredItems[0];

  // Active Group Name computation
  const activeGroupName = currentItem ? currentItem.groupName : "No Active Group";
  const activeChapterNum = currentItem ? currentItem.chapterNum : 1;

  // Keyboard navigation for Slide Deck mode
  useEffect(() => {
    if (viewMode !== "slide" || filteredItems.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "ArrowLeft" || (e.shiftKey && e.key === " ")) {
        e.preventDefault();
        setSlideIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setSlideIdx((i) => Math.min(filteredItems.length - 1, i + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewMode, filteredItems.length]);

  async function handleToggleBookmark(cardId: string, currentVal: boolean) {
    const nextVal = !currentVal;
    setChapterCards((prev) =>
      prev.map((item) =>
        item.card.id === cardId ? { ...item, card: { ...item.card, bookmarked: nextVal } } : item
      )
    );
    try {
      await api.patch(`/cards/${cardId}`, { bookmarked: nextVal });
    } catch {
      setChapterCards((prev) =>
        prev.map((item) =>
          item.card.id === cardId ? { ...item, card: { ...item.card, bookmarked: currentVal } } : item
        )
      );
    }
  }

  function jumpToChapter(startIndex: number) {
    // Find closest filtered index
    const targetCard = chapterCards[startIndex];
    if (!targetCard) return;
    const foundIdx = filteredItems.findIndex((item) => item.card.id === targetCard.card.id);
    if (foundIdx !== -1) {
      setSlideIdx(foundIdx);
    }
    setShowDrawer(false);
  }

  return (
    <div className="space-y-6">
      {/* Sticky Active Group Top Status Bar */}
      <div className="sticky top-14 z-30 bg-zinc-950/95 border-b border-border/80 backdrop-blur py-2.5 px-4 -mx-4 sm:-mx-6 flex items-center justify-between gap-3 flex-wrap shadow-md">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={`/notes/${notebook.id}/index`}
            className="px-2.5 py-1 rounded border border-border/80 hover:bg-zinc-800 text-xs font-bold text-foreground no-underline shrink-0"
          >
            ← Index
          </Link>
          <div className="flex items-center gap-2 truncate">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-accent/20 text-accent border border-accent/30 shrink-0">
              Ch {activeChapterNum} of {chaptersSummary.length}
            </span>
            <span className="text-xs font-bold text-foreground truncate">
              {activeGroupName}
            </span>
          </div>
        </div>

        {/* Feature A: Quick Index Drawer Trigger & View Mode Switcher */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowSearchModal(true)}
            className="px-2.5 py-1 rounded border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-bold uppercase tracking-wider cursor-pointer flex items-center gap-1.5"
            title="Search notes content (Ctrl+K)"
          >
            <span>🔍</span> Search <kbd className="hidden sm:inline text-[9px] px-1 py-0.2 rounded bg-black/40 border border-amber-500/40 text-amber-200">Ctrl+K</kbd>
          </button>

          <Link
            href={`/notes/${notebook.id}/index`}
            className="px-2.5 py-1 rounded border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-bold uppercase tracking-wider no-underline flex items-center gap-1"
            title="Configure Print PDF options and chapter order on Index page"
          >
            <span>🖨️</span> Print PDF
          </Link>

          <button
            type="button"
            onClick={() => setShowDrawer((s) => !s)}
            className="px-2.5 py-1 rounded border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            ≡ Quick Index
          </button>

          <div className="flex items-center rounded border border-border bg-black/40 p-0.5">
            <button
              type="button"
              onClick={() => changeViewMode("slide")}
              className={[
                "px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer",
                viewMode === "slide" ? "bg-accent text-background" : "text-muted hover:text-foreground",
              ].join(" ")}
            >
              🖼 Slide Deck
            </button>
            <button
              type="button"
              onClick={() => changeViewMode("scroll")}
              className={[
                "px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer",
                viewMode === "scroll" ? "bg-accent text-background" : "text-muted hover:text-foreground",
              ].join(" ")}
            >
              📜 Continuous
            </button>
          </div>
        </div>
      </div>

      {/* Card Kind & Search Filter Bar */}
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

        {/* Active Search Query Clear Chip */}
        {searchQuery.trim() && (
          <button
            type="button"
            onClick={() => applySearchQuery("")}
            className="px-2.5 py-1 rounded-[4px] border border-amber-500/60 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-sm animate-in fade-in duration-100"
            title="Clear search query filter"
          >
            <span>✕ Search: "{searchQuery}"</span>
          </button>
        )}

        <span className="text-xs font-mono text-muted ml-auto">
          {filteredItems.length} of {chapterCards.length} notes active
        </span>
      </div>

      {/* Main Content Area */}
      {filteredItems.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center text-sm text-muted rounded-[4px] bg-zinc-950/10">
          No notes match the selected card type filters.
        </div>
      ) : viewMode === "slide" ? (
        /* SLIDE DECK MODE (HORIZONTAL) */
        <div className="space-y-4 max-w-4xl mx-auto">
          {/* Controls Bar */}
          <div className="flex items-center justify-between text-xs font-mono text-muted bg-zinc-950/40 border border-border p-2.5 rounded-[4px]">
            <button
              type="button"
              disabled={slideIdx === 0}
              onClick={() => setSlideIdx((i) => Math.max(0, i - 1))}
              className="px-3 py-1.5 rounded border border-border hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed font-bold uppercase tracking-wider cursor-pointer"
            >
              ← Previous
            </button>
            <span className="font-bold text-accent">
              Slide {slideIdx + 1} of {filteredItems.length}
            </span>
            <button
              type="button"
              disabled={slideIdx === filteredItems.length - 1}
              onClick={() => setSlideIdx((i) => Math.min(filteredItems.length - 1, i + 1))}
              className="px-3 py-1.5 rounded border border-border hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed font-bold uppercase tracking-wider cursor-pointer"
            >
              Next →
            </button>
          </div>

          {/* Current Slide Card */}
          {currentItem && (
            <NotesSlideCard
              key={currentItem.card.id}
              card={currentItem.card}
              tagById={tagById}
              onToggleBookmark={handleToggleBookmark}
              searchQuery={searchQuery}
            />
          )}

          {/* Bottom Thumbnail Strip Navigator */}
          {filteredItems.length > 1 && (
            <div className="space-y-2 pt-2">
              <div className="text-[10px] uppercase font-bold tracking-wider text-muted">Jump to slide:</div>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {filteredItems.map((item, i) => {
                  const isSelected = i === slideIdx;
                  const thumb = item.card.source?.screenshotUrl ?? item.card.referenceImages?.[0];
                  const ts = item.card.source?.timestamp;
                  return (
                    <button
                      key={item.card.id}
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
          {filteredItems.map((item) => (
            <NotesSlideCard
              key={item.card.id}
              card={item.card}
              tagById={tagById}
              onToggleBookmark={handleToggleBookmark}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}

      {/* Feature A: Quick Index Drawer (Slide-Over) */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 bg-black/70 flex justify-end">
          <div className="w-full max-w-sm bg-zinc-900 border-l border-border h-full p-5 space-y-5 overflow-y-auto animate-in slide-in-from-right duration-200 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="font-bold text-sm uppercase tracking-wider text-foreground">
                  Quick Index
                </h3>
                <p className="text-[10px] text-muted font-mono">{notebook.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowDrawer(false)}
                className="text-xs text-muted hover:text-foreground font-bold"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted">Chapters List:</span>
                <span className="text-[10px] font-mono text-accent">{filteredChaptersSummary.length} chapters</span>
              </div>

              <input
                type="text"
                value={drawerSearch}
                onChange={(e) => setDrawerSearch(e.target.value)}
                placeholder="🔍 Search chapters..."
                className="w-full px-3 py-2 rounded border border-border/60 bg-[#121111] text-foreground placeholder-zinc-500 text-xs focus:outline-none focus:border-accent"
              />

              {filteredChaptersSummary.length === 0 ? (
                <p className="text-xs text-muted italic pt-2">No matching chapters found.</p>
              ) : (
                filteredChaptersSummary.map((ch) => (
                <button
                  key={ch.groupId}
                  type="button"
                  onClick={() => jumpToChapter(ch.startIndex)}
                  className={[
                    "w-full text-left p-3 rounded border text-xs transition-colors flex items-center justify-between cursor-pointer",
                    activeChapterNum === ch.chapterNum
                      ? "border-accent bg-zinc-800 text-accent font-bold"
                      : "border-border/60 bg-black/40 hover:bg-zinc-800/50 text-foreground",
                  ].join(" ")}
                >
                  <div className="space-y-0.5 truncate">
                    <div className="font-bold">Chapter {ch.chapterNum}</div>
                    <div className="text-muted text-[11px] truncate">{ch.groupName}</div>
                  </div>
                  <span className="text-[10px] font-mono text-accent">Jump →</span>
                </button>
              ))
            )}
            </div>
          </div>
        </div>
      )}

      {/* Master Search Command Palette Modal */}
      <NotesSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onApplySearchFilter={applySearchQuery}
        currentNotebook={notebook}
        chapterCards={chapterCards}
        tags={tags}
        initialQuery={searchQuery}
      />
    </div>
  );
}
