"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Card, Group, Subject, Tag } from "@/types";
import { resolveGroupCards, resolveSubjectCards } from "@/lib/due";

interface NotebookItem {
  id: string;
  name: string;
  kind: "subject" | "video" | "web" | "group";
  subLabel: string;
  matchingCards: Card[];
  imageCount: number;
  coverImage?: string;
  videoUrl?: string;
  webUrl?: string;
  tagIds: string[];
}

export function NotesHubClient({
  subjects,
  groups,
  tags,
  cards,
}: {
  subjects: Subject[];
  groups: Group[];
  tags: Tag[];
  cards: Card[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "subjects" | "video" | "web" | "group">("all");

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  // Build notebook list from subjects and groups
  const notebooks = useMemo(() => {
    const list: NotebookItem[] = [];

    // 1. Add Subjects
    for (const sub of subjects) {
      const subCards = resolveSubjectCards(sub, groups, cards, tags);
      let imgCount = 0;
      let cover: string | undefined;

      for (const c of subCards) {
        const screenshot = c.source?.screenshotUrl;
        const refs = c.referenceImages ?? [];
        if (screenshot || refs.length > 0) {
          imgCount += (screenshot ? 1 : 0) + refs.length;
          if (!cover) cover = screenshot ?? refs[0];
        }
      }

      list.push({
        id: sub.id,
        name: sub.name,
        kind: "subject",
        subLabel: `${sub.groupIds.length} groups inside`,
        matchingCards: subCards,
        imageCount: imgCount,
        coverImage: cover,
        tagIds: [],
      });
    }

    // 2. Add Groups
    for (const g of groups) {
      const gCards = resolveGroupCards(g, cards, tags);
      let imgCount = 0;
      let cover: string | undefined;

      for (const c of gCards) {
        const screenshot = c.source?.screenshotUrl;
        const refs = c.referenceImages ?? [];
        if (screenshot || refs.length > 0) {
          imgCount += (screenshot ? 1 : 0) + refs.length;
          if (!cover) cover = screenshot ?? refs[0];
        }
      }

      const kind = g.videoId ? "video" : g.webUrl ? "web" : "group";
      const subLabel = g.videoId
        ? "YouTube Video Notebook"
        : g.webUrl
        ? "Web Article Notebook"
        : `${g.tagIds.length} tag${g.tagIds.length === 1 ? "" : "s"}`;

      list.push({
        id: g.id,
        name: g.name,
        kind,
        subLabel,
        matchingCards: gCards,
        imageCount: imgCount,
        coverImage: cover,
        videoUrl: g.videoUrl,
        webUrl: g.webUrl,
        tagIds: g.tagIds,
      });
    }

    return list;
  }, [subjects, groups, tags, cards]);

  const visibleNotebooks = useMemo(() => {
    return notebooks.filter((n) => {
      if (activeTab === "subjects" && n.kind !== "subject") return false;
      if (activeTab === "video" && n.kind !== "video") return false;
      if (activeTab === "web" && n.kind !== "web") return false;
      if (activeTab === "group" && n.kind !== "group") return false;

      if (query.trim()) {
        const q = query.toLowerCase();
        const matchesName = n.name.toLowerCase().includes(q);
        const matchesTags = n.tagIds.some((tid) => tagById.get(tid)?.name.toLowerCase().includes(q));
        if (!matchesName && !matchesTags) return false;
      }
      return true;
    });
  }, [notebooks, activeTab, query, tagById]);

  function launchTest(n: NotebookItem) {
    const cardIds = n.matchingCards.map((c) => c.id);
    if (cardIds.length === 0) return;
    router.push(`/test/session?ids=${cardIds.join(",")}&shuffle=true`);
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 text-xs tracking-widest text-muted uppercase font-semibold mb-2">
            <span className="w-6 h-[2px] bg-accent" />
            Visual Lecture Library
          </div>
          <h1 className="cinematic-headline text-[10vw] sm:text-[8vw] md:text-[5vw] leading-[0.85] font-display font-bold tracking-tight mb-1" data-text="NOTES">
            NOTES
          </h1>
          <p className="text-sm text-muted mt-2 uppercase tracking-wider">
            Read through captured lecture screenshots and chapter notes sequentially.
          </p>
        </div>
      </div>

      <hr className="border-t border-divider my-6" />

      {/* Category Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: "all", label: "All Notebooks" },
            { id: "subjects", label: "Subjects" },
            { id: "video", label: "YouTube Videos" },
            { id: "web", label: "Web Articles" },
            { id: "group", label: "Tag Bundles" },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={[
                  "px-3 py-1.5 rounded-[4px] border text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer",
                  isActive
                    ? "bg-accent border-accent text-background font-bold"
                    : "border-border bg-black/25 text-muted hover:border-zinc-500 hover:text-foreground",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notebooks or tags…"
          className="px-3.5 py-2 rounded-[4px] border border-border/60 bg-black/40 text-foreground placeholder-zinc-500 text-sm focus:outline-none focus:border-accent"
        />
      </div>

      {/* Notebook Cards Grid */}
      {visibleNotebooks.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center text-sm text-muted rounded-[4px] bg-zinc-950/10">
          No notebooks match your filter.
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleNotebooks.map((n) => (
            <li
              key={n.kind + ":" + n.id}
              className="rounded-xl border border-border bg-zinc-950/30 hover:border-zinc-700 transition-colors p-4 flex flex-col justify-between gap-4 group"
            >
              {/* Cover Image Preview */}
              {n.coverImage ? (
                <div className="rounded-lg border border-border overflow-hidden bg-black/50 aspect-video relative">
                  <img
                    src={n.coverImage}
                    loading="lazy"
                    alt={n.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute bottom-2 right-2 bg-black/80 text-accent text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-accent/30">
                    🖼 {n.imageCount} slide{n.imageCount === 1 ? "" : "s"}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-border/50 bg-black/30 aspect-video flex flex-col items-center justify-center text-zinc-600 space-y-1">
                  <span className="text-2xl">📖</span>
                  <span className="text-[10px] font-mono">{n.matchingCards.length} notes</span>
                </div>
              )}

              {/* Title & Info */}
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                    {n.kind}
                  </span>
                  <span className="text-xs text-muted font-mono truncate">{n.subLabel}</span>
                </div>

                <h3 className="font-bold text-base text-foreground group-hover:text-accent transition-colors truncate">
                  {n.name}
                </h3>

                <p className="text-xs text-muted font-mono">
                  {n.matchingCards.length} note{n.matchingCards.length === 1 ? "" : "s"} total
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-border/30">
                <Link
                  href={`/notes/${n.id}?type=${n.kind}`}
                  className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest text-center transition-colors rounded-[4px] no-underline"
                >
                  📖 Read Notes
                </Link>
                <button
                  type="button"
                  onClick={() => launchTest(n)}
                  disabled={n.matchingCards.length === 0}
                  className="px-3 py-2 border border-border hover:border-accent text-foreground font-bold text-xs uppercase tracking-widest transition-colors rounded-[4px] disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Practice quiz"
                >
                  ▶ Quiz
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
