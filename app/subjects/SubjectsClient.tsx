"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Card, Group, Subject, Tag } from "@/types";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { descendantTagIds } from "@/lib/tags";

export function SubjectsClient({
  initialSubjects,
  groups,
  tags,
  cards,
}: {
  initialSubjects: Subject[];
  groups: Group[];
  tags: Tag[];
  cards: Card[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [subjects, setSubjects] = useState<Subject[]>(initialSubjects);
  const [deleting, setDeleting] = useState<string | null>(null);

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  // Pre-calculate card count for each group to merge
  const groupCards = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const g of groups) {
      if (g.videoId) {
        map.set(g.id, cards.filter((c) => c.source?.videoId === g.videoId));
      } else if (g.webUrl) {
        map.set(g.id, cards.filter((c) => c.source?.type === "web" && c.source.url === g.webUrl));
      } else {
        const expanded = descendantTagIds(tags, g.tagIds);
        map.set(g.id, cards.filter((c) => c.tags.some((t) => expanded.has(t))));
      }
    }
    return map;
  }, [groups, cards, tags]);

  // Pre-calculate subjects details (card count, nested groups)
  const subjectDetails = useMemo(() => {
    return subjects.map((s) => {
      const subGroups = s.groupIds.map((gid) => groupById.get(gid)).filter(Boolean) as Group[];
      const allCards = new Set<string>();
      for (const sg of subGroups) {
        const sgCards = groupCards.get(sg.id) || [];
        sgCards.forEach((c) => allCards.add(c.id));
      }
      return {
        subject: s,
        groups: subGroups,
        cardCount: allCards.size,
        cardIds: Array.from(allCards),
      };
    });
  }, [subjects, groupById, groupCards]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this subject?")) return;
    setDeleting(id);
    try {
      await api.delete(`/subjects/${id}`);
      setSubjects((prev) => prev.filter((s) => s.id !== id));
      toast("success", "Subject deleted");
    } catch {
      toast("error", "Failed to delete subject");
    } finally {
      setDeleting(null);
    }
  }

  function launchTest(cardIds: string[]) {
    if (cardIds.length === 0) {
      toast("error", "No cards available in this subject");
      return;
    }
    const params = new URLSearchParams();
    params.set("ids", cardIds.join(","));
    params.set("shuffle", "true");
    params.set("min", "1");
    params.set("max", "5");
    router.push(`/test/session?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 text-xs tracking-widest text-muted uppercase font-semibold mb-2">
            <span className="w-6 h-[2px] bg-accent" />
            Curriculum Organizer
          </div>
          <h1 className="cinematic-headline text-[10vw] sm:text-[8vw] md:text-[5vw] leading-[0.85] font-display font-bold tracking-tight mb-1" data-text="SUBJECTS">
            SUBJECTS
          </h1>
          <p className="text-sm text-muted mt-2 uppercase tracking-wider">
            Combine multiple study chapters and groups to quiz on entire subjects at once.
          </p>
        </div>
        <Link
          href="/subjects/new"
          className="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest transition-colors duration-150 rounded-[4px]"
        >
          + New Subject
        </Link>
      </div>

      <hr className="border-t border-divider my-6" />

      {subjects.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center text-sm text-muted rounded-[4px] bg-zinc-950/10">
          No subjects created yet.{" "}
          <Link href="/subjects/new" className="text-accent hover:underline font-bold uppercase tracking-wider">
            Create a subject
          </Link>{" "}
          first, then select chapters to combine.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {subjectDetails.map(({ subject, groups: subGroups, cardCount, cardIds }) => (
            <div
              key={subject.id}
              className="border border-border p-5 bg-zinc-950/20 flex flex-col justify-between rounded-[4px]"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-start gap-2">
                  <Link href={`/subjects/${subject.id}`} className="text-left group block hover:no-underline">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold font-display uppercase tracking-tight text-foreground group-hover:text-accent transition-colors">
                        {subject.name}
                      </h2>
                      {subject.exempted && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-amber-500/30 uppercase tracking-wider shrink-0">
                          Exempt
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted font-mono mt-0.5">
                      {cardCount} card{cardCount === 1 ? "" : "s"} ready
                    </p>
                  </Link>
                  <button
                    onClick={() => handleDelete(subject.id)}
                    disabled={deleting === subject.id}
                    className="p-1 rounded-md text-muted hover:text-rose-600 hover:bg-rose-950/20 transition-colors shrink-0"
                    title="Delete subject"
                    aria-label="Delete subject"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted">
                    Included Groups
                  </div>
                  {subGroups.length === 0 ? (
                    <p className="text-xs text-muted italic">No groups selected.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {subGroups.map((g) => (
                        <span
                          key={g.id}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-border"
                        >
                          {g.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => launchTest(cardIds)}
                  disabled={cardCount === 0}
                  className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed rounded-[4px]"
                >
                  Test Subject →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
