"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Card, Group, Tag } from "@/types";
import type { NoteBook } from "@/types/notes";
import { resolveGroupCards } from "@/lib/due";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";

interface Props {
  initialNotebooks: NoteBook[];
  groups: Group[];
  cards: Card[];
  tags: Tag[];
}

export function NotesHubClient({
  initialNotebooks,
  groups,
  cards,
  tags,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [notebooks, setNotebooks] = useState<NoteBook[]>(initialNotebooks);
  const [query, setQuery] = useState("");
  const [showModal, setShowModal] = useState(false);

  // Form state for new notebook
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  const filteredModalGroups = useMemo(() => {
    if (!groupSearch.trim()) return groups;
    const q = groupSearch.toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, groupSearch]);

  // Compute stats per notebook
  const notebookData = useMemo(() => {
    return notebooks.map((n) => {
      let totalCards = 0;
      let totalImages = 0;
      let coverImage: string | undefined;

      for (const gid of n.groupIds) {
        const g = groupMap.get(gid);
        if (!g) continue;
        const gCards = resolveGroupCards(g, cards, tags);
        totalCards += gCards.length;

        for (const c of gCards) {
          const screenshot = c.source?.screenshotUrl;
          const refs = c.referenceImages ?? [];
          if (screenshot || refs.length > 0) {
            totalImages += (screenshot ? 1 : 0) + refs.length;
            if (!coverImage) coverImage = screenshot ?? refs[0];
          }
        }
      }

      return {
        ...n,
        totalCards,
        totalImages,
        coverImage,
      };
    });
  }, [notebooks, groupMap, cards, tags]);

  const filteredNotebooks = useMemo(() => {
    if (!query.trim()) return notebookData;
    const q = query.toLowerCase();
    return notebookData.filter(
      (n) => n.name.toLowerCase().includes(q) || n.description?.toLowerCase().includes(q)
    );
  }, [notebookData, query]);

  function toggleGroupSelection(gid: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(gid) ? prev.filter((id) => id !== gid) : [...prev, gid]
    );
  }

  function moveGroupInModal(idx: number, dir: -1 | 1) {
    const next = [...selectedGroupIds];
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= next.length) return;
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    setSelectedGroupIds(next);
  }

  async function handleCreateNotebook() {
    if (!name.trim()) {
      toast("error", "Notebook name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<NoteBook>("/notes", {
        name: name.trim(),
        description: description.trim(),
        groupIds: selectedGroupIds,
      });
      setNotebooks((prev) => [...prev, res.data]);
      toast("success", "Notebook created successfully");
      setShowModal(false);
      setName("");
      setDescription("");
      setSelectedGroupIds([]);
    } catch {
      toast("error", "Failed to create notebook");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteNotebook(id: string, notebookName: string) {
    if (!confirm(`Delete notebook "${notebookName}"?`)) return;
    try {
      await api.delete(`/notes/${id}`);
      setNotebooks((prev) => prev.filter((n) => n.id !== id));
      toast("success", "Notebook deleted");
    } catch {
      toast("error", "Failed to delete notebook");
    }
  }

  function launchTest(groupIds: string[]) {
    const allCardIds: string[] = [];
    for (const gid of groupIds) {
      const g = groupMap.get(gid);
      if (!g) continue;
      const gCards = resolveGroupCards(g, cards, tags);
      for (const c of gCards) allCardIds.push(c.id);
    }
    if (allCardIds.length === 0) {
      toast("error", "No cards available in this notebook");
      return;
    }
    router.push(`/test/session?ids=${allCardIds.join(",")}&shuffle=true`);
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 text-xs tracking-widest text-muted uppercase font-semibold mb-2">
            <span className="w-6 h-[2px] bg-accent" />
            Standalone Note Volumes
          </div>
          <h1 className="cinematic-headline text-[10vw] sm:text-[8vw] md:text-[5vw] leading-[0.85] font-display font-bold tracking-tight mb-1" data-text="NOTEBOOKS">
            NOTEBOOKS
          </h1>
          <p className="text-sm text-muted mt-2 uppercase tracking-wider">
            Custom study volumes built from your captured lecture groups.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest transition-colors rounded-[4px] cursor-pointer"
        >
          + Create Notebook
        </button>
      </div>

      <hr className="border-t border-divider my-6" />

      {/* Search Input */}
      {notebooks.length > 0 && (
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notebooks…"
          className="w-full px-3.5 py-2.5 rounded-[4px] border border-border/60 bg-black/40 text-foreground placeholder-zinc-500 text-sm focus:outline-none focus:border-accent"
        />
      )}

      {/* Notebook Cards Grid */}
      {notebooks.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center text-sm text-muted rounded-[4px] bg-zinc-950/10 space-y-4">
          <p>No notebooks created yet. Create one to organize existing groups into study volumes.</p>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest transition-colors rounded-[4px] cursor-pointer"
          >
            + Create Notebook
          </button>
        </div>
      ) : filteredNotebooks.length === 0 ? (
        <p className="text-sm text-muted">No notebooks match your search query.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotebooks.map((n) => (
            <li
              key={n.id}
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
                    🖼 {n.totalImages} slide{n.totalImages === 1 ? "" : "s"}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-border/50 bg-black/30 aspect-video flex flex-col items-center justify-center text-zinc-600 space-y-1">
                  <span className="text-2xl">📖</span>
                  <span className="text-[10px] font-mono">{n.totalCards} cards</span>
                </div>
              )}

              {/* Title & Info */}
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-muted uppercase font-bold">
                    {n.groupIds.length} Chapter{n.groupIds.length === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteNotebook(n.id, n.name)}
                    className="text-xs text-rose-500 hover:text-rose-400 font-bold uppercase"
                    title="Delete notebook"
                  >
                    ✕
                  </button>
                </div>

                <h3 className="font-bold text-base text-foreground group-hover:text-accent transition-colors truncate">
                  {n.name}
                </h3>

                {n.description && (
                  <p className="text-xs text-muted line-clamp-2">{n.description}</p>
                )}

                <p className="text-xs text-muted font-mono pt-1">
                  {n.totalCards} total note{n.totalCards === 1 ? "" : "s"} inside
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-border/30 flex-wrap">
                <Link
                  href={`/notes/${n.id}`}
                  className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest text-center transition-colors rounded-[4px] no-underline"
                >
                  📖 Read Notes
                </Link>
                <Link
                  href={`/notes/${n.id}/index`}
                  className="px-3 py-2 border border-border hover:border-accent text-foreground font-bold text-xs uppercase tracking-widest transition-colors rounded-[4px] no-underline"
                  title="View and re-arrange chapters"
                >
                  📑 Index
                </Link>
                <button
                  type="button"
                  onClick={() => launchTest(n.groupIds)}
                  disabled={n.totalCards === 0}
                  className="px-3 py-2 border border-border hover:border-accent text-foreground font-bold text-xs uppercase tracking-widest transition-colors rounded-[4px] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Practice quiz"
                >
                  ▶ Quiz
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Create Notebook Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="cinematic-editor-panel max-w-xl w-full max-h-[90vh] overflow-y-auto space-y-5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="font-bold text-sm uppercase tracking-wider text-foreground">
                Create New Notebook
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-xs text-muted hover:text-foreground uppercase font-bold"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold tracking-wider text-muted">Notebook Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='e.g. "GATE Computer Networks Complete Course"'
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-[4px] border border-border/60 bg-black/40 text-foreground placeholder-zinc-600 text-sm focus:outline-none focus:border-accent"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold tracking-wider text-muted">Description (Optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder='e.g. "Lecture notes and slide review for IP Addressing & Subnetting"'
                className="w-full px-3.5 py-2.5 rounded-[4px] border border-border/60 bg-black/40 text-foreground placeholder-zinc-600 text-sm focus:outline-none focus:border-accent"
              />
            </div>

            {/* Select Existing Groups */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase font-bold tracking-wider text-muted">Select & Order Groups (Chapters)</label>
                <span className="text-xs text-accent font-mono">{selectedGroupIds.length} selected</span>
              </div>

              <input
                type="text"
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                placeholder="🔍 Search chapters / groups by title..."
                className="w-full px-3 py-2 rounded border border-border/60 bg-[#121111] text-foreground placeholder-zinc-500 text-xs focus:outline-none focus:border-accent"
              />

              <div className="border border-border bg-black/30 rounded-[4px] p-3 max-h-60 overflow-y-auto space-y-2">
                {filteredModalGroups.length === 0 ? (
                  <p className="text-xs text-muted italic">
                    {groups.length === 0 ? "No groups exist in database." : "No groups match your search query."}
                  </p>
                ) : (
                  filteredModalGroups.map((g) => {
                    const isSelected = selectedGroupIds.includes(g.id);
                    const selectedIdx = selectedGroupIds.indexOf(g.id);
                    return (
                      <div
                        key={g.id}
                        onClick={() => toggleGroupSelection(g.id)}
                        className={[
                          "p-2.5 rounded border flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors select-none",
                          isSelected ? "border-accent bg-zinc-900" : "border-border/50 hover:bg-zinc-900/40",
                        ].join(" ")}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={[
                              "w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 font-bold",
                              isSelected ? "bg-accent border-accent text-background" : "border-zinc-700 text-transparent",
                            ].join(" ")}
                          >
                            ✓
                          </span>
                          <span className="font-semibold truncate">{g.name}</span>
                        </div>

                        {isSelected && (
                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[10px] font-mono text-muted mr-1">Ch {selectedIdx + 1}</span>
                            <button
                              type="button"
                              disabled={selectedIdx === 0}
                              onClick={() => moveGroupInModal(selectedIdx, -1)}
                              className="px-1.5 py-0.5 rounded border border-border hover:bg-zinc-800 disabled:opacity-30 text-[10px] font-bold"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              disabled={selectedIdx === selectedGroupIds.length - 1}
                              onClick={() => moveGroupInModal(selectedIdx, 1)}
                              className="px-1.5 py-0.5 rounded border border-border hover:bg-zinc-800 disabled:opacity-30 text-[10px] font-bold"
                            >
                              ▼
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={handleCreateNotebook}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest transition-colors rounded-[4px] disabled:opacity-40"
              >
                {saving ? "Saving…" : "Create Notebook"}
              </button>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 border border-border hover:bg-zinc-900 text-foreground font-bold text-xs uppercase tracking-widest transition-colors rounded-[4px]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
