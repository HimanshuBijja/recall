"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Card, CardKind, Group, Tag } from "@/types";
import type { NoteBook } from "@/types/notes";
import { resolveGroupCards } from "@/lib/due";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import NotesPdfPrintModal, { PdfPrintOptions } from "@/components/NotesPdfPrintModal";

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
  const [exportDate, setExportDate] = useState("");
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfOptions, setPdfOptions] = useState<PdfPrintOptions>({
    selectedKinds: ["mcq", "multi", "tf-sort", "flash", "cloze", "match"],
    slidesPerPage: 1,
  });

  useEffect(() => {
    setExportDate(new Date().toLocaleDateString());
  }, []);

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
        cards: gCards,
      };
    }).filter(Boolean) as { chapterNum: number; group: Group; cardsCount: number; imgCount: number; cards: Card[] }[];
  }, [notebook.groupIds, groupMap, cards, tags]);

  // Available card kinds among notebook cards with screenshots
  const availableKinds = useMemo(() => {
    const kinds = new Set<CardKind>();
    for (const ch of chapters) {
      for (const c of ch.cards) {
        if (c.source?.screenshotUrl || (c.referenceImages && c.referenceImages.length > 0)) {
          kinds.add(c.kind || "mcq");
        }
      }
    }
    return Array.from(kinds);
  }, [chapters]);

  // Filtered chapters & cards for PDF print output
  const printableChapters = useMemo(() => {
    return chapters.map((ch) => {
      const matchingCards = ch.cards
        .filter((c) => pdfOptions.selectedKinds.includes(c.kind || "mcq"))
        .filter((c) => Boolean(c.source?.screenshotUrl || (c.referenceImages && c.referenceImages.length > 0)))
        .sort((a, b) => {
          const timeA = a.source?.timestamp ?? Number.MAX_SAFE_INTEGER;
          const timeB = b.source?.timestamp ?? Number.MAX_SAFE_INTEGER;
          return timeA - timeB;
        });

      return {
        ...ch,
        cards: matchingCards,
      };
    }).filter((ch) => ch.cards.length > 0);
  }, [chapters, pdfOptions.selectedKinds]);

  const totalMatchingScreenshots = useMemo(() => {
    return printableChapters.reduce((sum, ch) => {
      let cnt = 0;
      for (const c of ch.cards) {
        if (c.source?.screenshotUrl) cnt++;
        if (c.referenceImages) cnt += c.referenceImages.length;
      }
      return sum + cnt;
    }, 0);
  }, [printableChapters]);

  const handleExecutePrint = (options: PdfPrintOptions) => {
    setPdfOptions(options);
    setShowPdfModal(false);
    setTimeout(() => {
      window.print();
    }, 250);
  };

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

  const [chapterSearch, setChapterSearch] = useState("");

  const unassignedGroups = useMemo(() => {
    return groups.filter((g) => !notebook.groupIds.includes(g.id));
  }, [groups, notebook.groupIds]);

  const filteredUnassignedGroups = useMemo(() => {
    if (!chapterSearch.trim()) return unassignedGroups;
    const q = chapterSearch.toLowerCase();
    return unassignedGroups.filter((g) => g.name.toLowerCase().includes(q));
  }, [unassignedGroups, chapterSearch]);

  return (
    <>
      <div className="index-ui print:hidden space-y-6 max-w-4xl mx-auto">
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
            onClick={() => setShowPdfModal(true)}
            className="px-3.5 py-2 border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold text-xs uppercase tracking-widest transition-colors rounded-[4px] cursor-pointer flex items-center gap-1.5"
            title="Print high-res PDF with screenshots only, Chrome/Edge outlines, and invisible Ctrl+F search"
          >
            <span>🖨️</span> Print PDF
          </button>
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

            <input
              type="text"
              value={chapterSearch}
              onChange={(e) => setChapterSearch(e.target.value)}
              placeholder="🔍 Search available chapters by title..."
              className="w-full px-3 py-2 rounded border border-border/60 bg-[#121111] text-foreground placeholder-zinc-500 text-xs focus:outline-none focus:border-accent"
            />

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {filteredUnassignedGroups.length === 0 ? (
                <p className="text-xs text-muted italic">
                  {unassignedGroups.length === 0
                    ? "All available groups are already assigned to this notebook."
                    : "No matching groups found."}
                </p>
              ) : (
                filteredUnassignedGroups.map((g) => (
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

      {/* PDF Export Options Modal */}
      <NotesPdfPrintModal
        isOpen={showPdfModal}
        onClose={() => setShowPdfModal(false)}
        onPrint={handleExecutePrint}
        availableKinds={availableKinds}
        matchingCount={totalMatchingScreenshots}
      />
      </div>

      {/* Off-screen Printable Document Container (Only visible during window.print()) */}
      <div id="pdf-print-container" className="hidden print:block text-black bg-white p-8">
        {/* Page 1: Table of Contents & Notebook Summary */}
        <div className="pdf-page-toc space-y-6 pb-8 border-b-2 border-black mb-8">
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-black">{notebook.name}</h1>
            {notebook.description && <p className="text-sm text-gray-700 font-serif italic">{notebook.description}</p>}
            <p className="text-xs text-gray-500 font-mono pt-1">
              Notebook Study Deck · {printableChapters.length} Chapters · {totalMatchingScreenshots} Slides{exportDate ? ` · Exported on ${exportDate}` : ""}
            </p>
          </div>

          <div className="bg-gray-50 border border-gray-300 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-bold uppercase tracking-wider text-black border-b border-gray-300 pb-2">
              Table of Contents
            </h2>
            <ol className="space-y-2 font-serif text-sm">
              {printableChapters.map((ch) => (
                <li key={ch.group.id} className="flex items-baseline justify-between border-b border-dotted border-gray-300 pb-1">
                  <a href={`#pdf-ch-${ch.chapterNum}`} className="font-bold text-black no-underline hover:underline">
                    Chapter {ch.chapterNum}: {ch.group.name}
                  </a>
                  <span className="text-xs font-mono text-gray-600">
                    {ch.cards.length} slide{ch.cards.length === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Chapter Slides */}
        <div className="space-y-12">
          {printableChapters.map((ch) => (
            <section key={ch.group.id} className="pdf-chapter-section space-y-6 pdf-page-break">
              {/* Semantic H1/H2 Heading for Chrome & Edge PDF Sidebar Outline Bookmarks */}
              <div className="border-b-2 border-black pb-2 pt-4">
                <h1
                  id={`pdf-ch-${ch.chapterNum}`}
                  className="pdf-chapter-header text-xl font-bold uppercase tracking-wide text-black"
                >
                  Chapter {ch.chapterNum}: {ch.group.name}
                </h1>
                {ch.group.videoUrl && (
                  <p className="text-xs text-gray-500 font-mono mt-0.5">Video: {ch.group.videoUrl}</p>
                )}
              </div>

              {/* Grid of Screenshots based on slidesPerPage */}
              <div
                className={`grid gap-6 ${
                  pdfOptions.slidesPerPage === 1
                    ? "grid-cols-1"
                    : pdfOptions.slidesPerPage === 2
                    ? "grid-cols-1 gap-8"
                    : "grid-cols-2 gap-6"
                }`}
              >
                {ch.cards.map((c, cIdx) => {
                  const imgUrl = c.source?.screenshotUrl ?? (c.referenceImages && c.referenceImages[0]);
                  if (!imgUrl) return null;

                  const sec = typeof c.source?.timestamp === "number" ? Math.floor(c.source.timestamp) : null;
                  const mm = sec !== null ? Math.floor(sec / 60) : null;
                  const ss = sec !== null ? String(sec % 60).padStart(2, "0") : null;
                  const timeLabel = mm !== null && ss !== null ? `${mm}:${ss}` : null;

                  return (
                    <div
                      key={c.id}
                      className="pdf-slide-card bg-white pdf-no-split flex flex-col items-center justify-center relative overflow-hidden w-full"
                    >
                      {/* Searchable Text Layer Positioned DIRECTLY BEHIND Image for Ctrl+F Search */}
                      <div
                        className="pdf-searchable-text"
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: "100%",
                          zIndex: 1,
                          color: "#ffffff",
                          backgroundColor: "#ffffff",
                          fontSize: "12px",
                          lineHeight: "1.4",
                          overflow: "hidden",
                          wordBreak: "break-word",
                          userSelect: "text",
                        }}
                      >
                        Chapter {ch.chapterNum}: {ch.group.name}. Slide {cIdx + 1}. {c.question} {c.answer} {c.explanation} {c.tags?.join(" ")} {c.kind} {timeLabel ? `Timestamp ${timeLabel}` : ""}
                      </div>

                      {/* High-res Screenshot Image layered cleanly ON TOP (z-index: 10, borderless) */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imgUrl}
                        alt={c.question || `Slide ${ch.chapterNum}.${cIdx + 1}`}
                        className="relative z-10 w-full h-auto max-h-[850px] object-contain"
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
