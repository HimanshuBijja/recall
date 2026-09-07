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
  initialNotebook: NoteBook;
  groups: Group[];
  cards: Card[];
  tags: Tag[];
}

export function NotebookIndexClient({
  initialNotebook,
  groups,
  cards,
  tags,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [notebook, setNotebook] = useState<NoteBook>(initialNotebook);
  const [saving, setSaving] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);

  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  // Compute chapter data in configured order
  const chapters = useMemo(() => {
    return notebook.groupIds.map((gid, index) => {
      const g = groupMap.get(gid);
      if (!g) return null;
      const gCards = resolveGroupCards(g, cards, tags);
      let imgCount = 0;
      for (const c of gCards) {
        if (c.source?.screenshotUrl) imgCount++;
        if (c.referenceImages) imgCount += c.referenceImages.length;
      }
      return {
        chapterNum: index + 1,
        group: g,
        cardsCount: gCards.length,
        imgCount,
      };
    }).filter(Boolean) as { chapterNum: number; group: Group; cardsCount: number; imgCount: number }[];
  }, [notebook.groupIds, groupMap, cards, tags]);

  // Total cards in notebook
  const totalNotebookCards = useMemo(() => {
    return chapters.reduce((sum, ch) => sum + ch.cardsCount, 0);
  }, [chapters]);

  async function updateGroupOrder(newGroupIds: string[]) {
    setSaving(true);
    try {
      const res = await api.put<NoteBook>(`/notes/${notebook.id}`, {
        groupIds: newGroupIds,
      });
      setNotebook(res.data);
      toast("success", "Chapter order updated");
    } catch {
      toast("error", "Failed to update chapter order");
    } finally {
      setSaving(false);
    }
  }

  function moveChapter(idx: number, dir: -1 | 1) {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= notebook.groupIds.length) return;
    const nextGroupIds = [...notebook.groupIds];
    [nextGroupIds[idx], nextGroupIds[targetIdx]] = [nextGroupIds[targetIdx], nextGroupIds[idx]];
    updateGroupOrder(nextGroupIds);
  }

  function removeChapter(gid: string) {
    const nextGroupIds = notebook.groupIds.filter((id) => id !== gid);
    updateGroupOrder(nextGroupIds);
  }

  function addChapter(gid: string) {
    if (notebook.groupIds.includes(gid)) return;
    const nextGroupIds = [...notebook.groupIds, gid];
    updateGroupOrder(nextGroupIds);
    setShowAddGroupModal(false);
  }

  // Feature E: Export Notebook to Markdown File
  function handleExportNotebook() {
    let md = `# Notebook: ${notebook.name}\n\n`;
    if (notebook.description) md += `${notebook.description}\n\n`;
    md += `_Exported from Recall on ${new Date().toLocaleDateString()}_\n\n---\n\n`;

    chapters.forEach((ch) => {
      const g = ch.group;
      md += `## Chapter ${ch.chapterNum}: ${g.name}\n\n`;
      if (g.videoUrl) md += `**Video Link:** ${g.videoUrl}\n\n`;

      const gCards = resolveGroupCards(g, cards, tags).sort((a, b) => {
        const timeA = a.source?.timestamp ?? Number.MAX_SAFE_INTEGER;
        const timeB = b.source?.timestamp ?? Number.MAX_SAFE_INTEGER;
        return timeA - timeB;
      });

      gCards.forEach((c, cIdx) => {
        md += `### ${ch.chapterNum}.${cIdx + 1} ${c.question}\n\n`;
        if (c.source?.screenshotUrl) {
          md += `![Lecture Frame](${c.source.screenshotUrl})\n\n`;
        }
        if (c.answer) md += `**Answer / Notes:**\n${c.answer}\n\n`;
        if (c.explanation) md += `**Explanation:**\n${c.explanation}\n\n`;
        if (c.source?.videoId && typeof c.source.timestamp === "number") {
          const sec = Math.floor(c.source.timestamp);
          md += `▶ [Watch on YouTube at ${sec}s](https://www.youtube.com/watch?v=${c.source.videoId}&t=${sec}s)\n\n`;
        }
        md += `---\n\n`;
      });
    });

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${notebook.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_notes.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast("success", "Exported notebook as Markdown file");
  }

  function launchTest() {
    const allCardIds: string[] = [];
    for (const gid of notebook.groupIds) {
      const g = groupMap.get(gid);
      if (!g) continue;
      const gCards = resolveGroupCards(g, cards, tags);
      for (const c of gCards) allCardIds.push(c.id);
    }
    if (allCardIds.length === 0) return;
    router.push(`/test/session?ids=${allCardIds.join(",")}&shuffle=true`);
  }

  const unassignedGroups = useMemo(() => {
    return groups.filter((g) => !notebook.groupIds.includes(g.id));
  }, [groups, notebook.groupIds]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Bar Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 text-xs tracking-widest text-muted uppercase font-semibold mb-2">
            <span className="w-6 h-[2px] bg-accent" />
            Notebook Table of Contents & Chapter Organizer
          </div>
          <h1 className="cinematic-headline text-[8vw] sm:text-[6vw] md:text-[4vw] leading-[0.85] font-display font-bold tracking-tight mb-1" data-text={notebook.name}>
            {notebook.name}
          </h1>
          {notebook.description && (
            <p className="text-xs text-muted font-mono mt-1">{notebook.description}</p>
          )}
          <p className="text-xs text-accent font-mono mt-1">
            {chapters.length} Chapters · {totalNotebookCards} Total Notes
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/notes"
            className="px-3.5 py-2 border border-border hover:bg-zinc-900 text-foreground font-bold text-xs uppercase tracking-widest transition-colors rounded-[4px] no-underline"
          >
            ← Notebooks Hub
          </Link>
          <Link
            href={`/notes/${notebook.id}`}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest transition-colors rounded-[4px] no-underline"
          >
            📖 Read Notes →
          </Link>
          <button
            type="button"
            onClick={handleExportNotebook}
            className="px-3.5 py-2 border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold text-xs uppercase tracking-widest transition-colors rounded-[4px] cursor-pointer"
            title="Export full notebook to Markdown summary"
          >
            📥 Export (.MD)
          </button>
        </div>
      </div>

      <hr className="border-t border-divider my-6" />

      {/* Index Controls Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 bg-zinc-950/20 border border-border p-3 rounded-[4px]">
        <div className="text-xs uppercase font-bold tracking-wider text-muted">
          Re-arrange Chapter Sequence (Up / Down):
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowAddGroupModal(true)}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold uppercase tracking-wider rounded border border-zinc-700 cursor-pointer"
          >
            + Add Chapter Group
          </button>
          <button
            type="button"
            onClick={launchTest}
            disabled={totalNotebookCards === 0}
            className="px-3 py-1.5 border border-border hover:border-accent text-foreground text-xs font-bold uppercase tracking-wider rounded disabled:opacity-40"
          >
            ▶ Quiz Notebook
          </button>
        </div>
      </div>

      {/* Chapter List (Ordered Groups) */}
      {chapters.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center text-sm text-muted rounded-[4px] bg-zinc-950/10 space-y-3">
          <p>This notebook has no chapters assigned yet.</p>
          <button
            type="button"
            onClick={() => setShowAddGroupModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest transition-colors rounded-[4px] cursor-pointer"
          >
            + Add Group
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {chapters.map((ch, idx) => (
            <li
              key={ch.group.id}
              className="rounded-xl border border-border bg-zinc-950/30 p-4 flex items-center justify-between gap-4 flex-wrap"
            >
              {/* Chapter Info */}
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-full bg-accent/20 text-accent font-bold font-mono text-sm flex items-center justify-center shrink-0 border border-accent/30">
                  {ch.chapterNum}
                </span>
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-foreground truncate">
                      {ch.group.name}
                    </h3>
                    {ch.group.videoId && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-950 text-red-400 border border-red-900">
                        YouTube
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted font-mono">
                    {ch.cardsCount} note{ch.cardsCount === 1 ? "" : "s"} · {ch.imgCount} screenshot{ch.imgCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              {/* Chapter Controls (Move Up / Down & Actions) */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <div className="flex items-center gap-1 border border-border rounded p-0.5 bg-black/40">
                  <button
                    type="button"
                    disabled={idx === 0 || saving}
                    onClick={() => moveChapter(idx, -1)}
                    className="px-2 py-1 text-xs font-bold text-foreground hover:bg-zinc-800 disabled:opacity-30 rounded cursor-pointer"
                    title="Move chapter up"
                  >
                    ▲ Up
                  </button>
                  <button
                    type="button"
                    disabled={idx === chapters.length - 1 || saving}
                    onClick={() => moveChapter(idx, 1)}
                    className="px-2 py-1 text-xs font-bold text-foreground hover:bg-zinc-800 disabled:opacity-30 rounded cursor-pointer"
                    title="Move chapter down"
                  >
                    ▼ Down
                  </button>
                </div>

                <Link
                  href={`/notes/${notebook.id}?startChapter=${idx}`}
                  className="px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 font-bold text-xs uppercase tracking-wider rounded border border-indigo-500/40 no-underline"
                >
                  Read Chapter →
                </Link>

                <button
                  type="button"
                  onClick={() => removeChapter(ch.group.id)}
                  className="p-1.5 text-rose-500 hover:text-rose-400 font-bold text-xs uppercase"
                  title="Remove group from notebook"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Add Chapter Modal */}
      {showAddGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="cinematic-editor-panel max-w-md w-full space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h3 className="font-bold text-sm uppercase tracking-wider text-foreground">
                Add Chapter to Notebook
              </h3>
              <button
                type="button"
                onClick={() => setShowAddGroupModal(false)}
                className="text-xs text-muted hover:text-foreground font-bold"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {unassignedGroups.length === 0 ? (
                <p className="text-xs text-muted italic">All available groups are already assigned to this notebook.</p>
              ) : (
                unassignedGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => addChapter(g.id)}
                    className="w-full text-left p-3 rounded border border-border hover:border-accent bg-black/40 hover:bg-zinc-900 transition-colors flex items-center justify-between text-xs cursor-pointer"
                  >
                    <span className="font-semibold">{g.name}</span>
                    <span className="text-accent font-bold">+ Add</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
