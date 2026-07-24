"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Card, Group, Subject, Tag } from "@/types";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { descendantTagIds } from "@/lib/tags";

export function SubjectDetailClient({
  subject: initialSubject,
  groups,
  tags,
  cards,
}: {
  subject: Subject;
  groups: Group[];
  tags: Tag[];
  cards: Card[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [subject, setSubject] = useState<Subject>(initialSubject);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(initialSubject.groupIds);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  // Pre-calculate card count for each group to merge
  const groupCards = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const g of groups) {
      if (g.videoId) {
        map.set(g.id, cards.filter((c) => c.source?.videoId === g.videoId));
      } else {
        const expanded = descendantTagIds(tags, g.tagIds);
        map.set(g.id, cards.filter((c) => c.tags.some((t) => expanded.has(t))));
      }
    }
    return map;
  }, [groups, cards, tags]);

  // Current subject stats
  const { currentGroups, cardCount, cardIds } = useMemo(() => {
    const subGroups = subject.groupIds.map((gid) => groupById.get(gid)).filter(Boolean) as Group[];
    const allCards = new Set<string>();
    for (const sg of subGroups) {
      const sgCards = groupCards.get(sg.id) || [];
      sgCards.forEach((c) => allCards.add(c.id));
    }
    return {
      currentGroups: subGroups,
      cardCount: allCards.size,
      cardIds: Array.from(allCards),
    };
  }, [subject, groupById, groupCards]);

  function toggleGroup(gid: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(gid) ? prev.filter((id) => id !== gid) : [...prev, gid]
    );
  }

  async function handleSaveChanges() {
    setSaving(true);
    try {
      const res = await api.put<Subject>(`/subjects/${subject.id}`, {
        groupIds: selectedGroupIds,
      });
      setSubject(res.data);
      toast("success", "Subject updated successfully");
      setIsEditing(false);
      router.refresh();
    } catch {
      toast("error", "Failed to update subject groups");
    } finally {
      setSaving(false);
    }
  }

  function launchTest() {
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
            Subject Details & Config
          </div>
          <h1 className="cinematic-headline text-[5vw] md:text-[3.5vw] sm:text-[5vw] leading-[0.85] font-display font-bold tracking-tight mb-1" data-text={subject.name}>
            {subject.name}
          </h1>
          <p className="text-xs text-muted font-mono mt-1">
            {cardCount} Total revision card{cardCount === 1 ? "" : "s"} inside
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/subjects"
            className="px-4 py-2 border border-border hover:bg-zinc-900 text-foreground font-bold text-xs uppercase tracking-widest transition-colors duration-150 rounded-[4px]"
          >
            ← Subjects
          </Link>
          <button
            onClick={launchTest}
            disabled={cardCount === 0}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed rounded-[4px]"
          >
            Test Subject →
          </button>
        </div>
      </div>

      <hr className="border-t border-divider my-6" />

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Left pane: Active Groups (span 7) */}
        <div className="md:col-span-7 space-y-6">
          <div className="border border-border p-5 bg-zinc-950/20 rounded-[4px] space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xs uppercase font-bold tracking-wider text-muted">
                Active Chapters / Groups
              </h2>
              <button
                onClick={() => {
                  setSelectedGroupIds(subject.groupIds);
                  setIsEditing((prev) => !prev);
                }}
                className="text-xs text-accent hover:underline font-bold uppercase tracking-wider"
              >
                {isEditing ? "Hide Manager" : "Manage Groups"}
              </button>
            </div>

            {currentGroups.length === 0 ? (
              <p className="text-sm text-muted italic">
                No chapters are currently linked to this subject. Link some using the Group Manager link.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentGroups.map((g) => {
                  const groupCardLen = groupCards.get(g.id)?.length || 0;
                  return (
                    <div
                      key={g.id}
                      className="border border-border p-3 rounded-[4px] bg-background/50 space-y-1.5"
                    >
                      <div className="text-sm font-semibold">{g.name}</div>
                      <div className="text-[10px] text-muted font-mono">
                        {groupCardLen} card{groupCardLen === 1 ? "" : "s"} · {g.videoId ? "YouTube Video" : "Tags"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right pane: Group Manager panel (span 5) */}
        <div className="md:col-span-5 space-y-6">
          {isEditing && (
            <div className="border border-border p-5 bg-zinc-950/40 rounded-[4px] space-y-4">
              <div>
                <h3 className="text-xs uppercase font-bold tracking-wider text-muted mb-1">
                  Manage Included Groups
                </h3>
                <p className="text-[10px] text-muted uppercase tracking-wide">
                  Check or uncheck groups to modify what is inside this subject.
                </p>
              </div>

              {groups.length === 0 ? (
                <p className="text-xs text-muted italic">No study groups exist in database.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto p-1 border border-border bg-background/30 rounded-[4px]">
                  {groups.map((g) => {
                    const isSelected = selectedGroupIds.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => toggleGroup(g.id)}
                        className={[
                          "w-full flex items-center justify-between p-2.5 border text-left rounded-[4px] transition-colors text-xs",
                          isSelected
                            ? "border-accent bg-zinc-900"
                            : "border-border hover:bg-zinc-900/30",
                        ].join(" ")}
                      >
                        <span className="font-semibold truncate max-w-[180px]">{g.name}</span>
                        <div
                          className={[
                            "w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center text-[9px] shrink-0",
                            isSelected
                              ? "border-accent bg-accent text-background font-bold"
                              : "border-border",
                          ].join(" ")}
                        >
                          {isSelected && "✓"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveChanges}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed rounded-[4px]"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={() => {
                    setSelectedGroupIds(subject.groupIds);
                    setIsEditing(false);
                  }}
                  className="px-4 py-2 border border-border hover:bg-zinc-900 text-foreground font-bold text-xs uppercase tracking-widest transition-colors duration-150 rounded-[4px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
