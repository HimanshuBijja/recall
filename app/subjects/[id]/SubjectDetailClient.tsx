"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Card, Group, Subject, Tag } from "@/types";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { descendantTagIds } from "@/lib/tags";

export const KIND_CONFIG: Record<string, { label: string; activeClass: string }> = {
  mcq: {
    label: "MCQ",
    activeClass: "bg-indigo-600 border-indigo-600 text-white dark:bg-indigo-950/60 dark:border-indigo-800 dark:text-indigo-300"
  },
  flash: {
    label: "Flash",
    activeClass: "bg-rose-600 border-rose-600 text-white dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-300"
  },
  match: {
    label: "Match",
    activeClass: "bg-purple-600 border-purple-600 text-white dark:bg-purple-950/60 dark:border-purple-800 dark:text-purple-300"
  },
  cloze: {
    label: "Cloze",
    activeClass: "bg-teal-600 border-teal-600 text-white dark:bg-teal-950/60 dark:border-teal-800 dark:text-teal-300"
  },
  multi: {
    label: "Multi",
    activeClass: "bg-cyan-600 border-cyan-600 text-white dark:bg-cyan-950/60 dark:border-cyan-800 dark:text-cyan-300"
  },
  "tf-sort": {
    label: "T/F",
    activeClass: "bg-amber-600 border-amber-600 text-white dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300"
  }
};

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
  const [exempted, setExempted] = useState(initialSubject.exempted ?? false);
  const [name, setName] = useState(initialSubject.name);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingExempt, setSavingExempt] = useState(false);

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
  const { currentGroups, cardCount, cardIds, subjectCards } = useMemo(() => {
    const subGroups = subject.groupIds.map((gid) => groupById.get(gid)).filter(Boolean) as Group[];
    const allCards = new Map<string, Card>();
    for (const sg of subGroups) {
      const sgCards = groupCards.get(sg.id) || [];
      sgCards.forEach((c) => allCards.set(c.id, c));
    }
    const cardList = Array.from(allCards.values());
    return {
      currentGroups: subGroups,
      cardCount: cardList.length,
      cardIds: cardList.map((c) => c.id),
      subjectCards: cardList,
    };
  }, [subject, groupById, groupCards]);

  const kindsInSubject = useMemo(() => {
    const kinds = new Set<string>();
    for (const c of subjectCards) {
      kinds.add(c.kind || "mcq");
    }
    return Array.from(kinds);
  }, [subjectCards]);

  const [selectedKinds, setSelectedKinds] = useState<string[]>(["mcq", "multi", "flash", "cloze", "tf-sort", "match"]);

  const testCards = useMemo(() => {
    return subjectCards.filter((c) => selectedKinds.includes(c.kind || "mcq"));
  }, [subjectCards, selectedKinds]);

  const testCardIds = useMemo(() => testCards.map((c) => c.id), [testCards]);

  function toggleGroup(gid: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(gid) ? prev.filter((id) => id !== gid) : [...prev, gid]
    );
  }

  async function handleToggleExempt(checked: boolean) {
    setSavingExempt(true);
    setExempted(checked);
    try {
      const res = await api.put<Subject>(`/subjects/${subject.id}`, {
        name: name.trim(),
        groupIds: subject.groupIds,
        exempted: checked,
      });
      setSubject(res.data);
      toast("success", checked ? "Subject exempted from spaced repetition" : "Subject included in spaced repetition");
      router.refresh();
    } catch {
      toast("error", "Failed to update subject settings");
      setExempted(!checked); // revert state on failure
    } finally {
      setSavingExempt(false);
    }
  }

  async function handleSaveChanges() {
    if (!name.trim()) {
      toast("error", "Subject name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await api.put<Subject>(`/subjects/${subject.id}`, {
        name: name.trim(),
        groupIds: selectedGroupIds,
        exempted: exempted,
      });
      setSubject(res.data);
      toast("success", "Subject updated successfully");
      setIsEditing(false);
      router.refresh();
    } catch {
      toast("error", "Failed to update subject settings");
    } finally {
      setSaving(false);
    }
  }

  function launchTest() {
    if (testCardIds.length === 0) {
      toast("error", "No cards available for the selected types");
      return;
    }
    const params = new URLSearchParams();
    params.set("ids", testCardIds.join(","));
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
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="cinematic-headline text-[10vw] sm:text-[8vw] md:text-[5vw] leading-[0.85] font-display font-bold tracking-tight mb-1" data-text={subject.name}>
              {subject.name}
            </h1>
            {subject.exempted && (
              <span className="text-xs font-bold px-2 py-1 rounded bg-amber-500/20 text-amber-500 border border-amber-500/30 uppercase tracking-widest shrink-0">
                Exempt
              </span>
            )}
          </div>
          <p className="text-xs text-muted font-mono mt-1">
            {cardCount} Total revision card{cardCount === 1 ? "" : "s"} inside
          </p>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <label className="flex items-center gap-2.5 px-4 py-2 border border-border bg-black/25 hover:bg-zinc-900 rounded-[4px] cursor-pointer transition-colors text-xs font-bold uppercase tracking-widest text-muted select-none">
            <input
              type="checkbox"
              checked={exempted}
              onChange={(e) => handleToggleExempt(e.target.checked)}
              disabled={savingExempt}
              className="w-4 h-4 accent-accent cursor-pointer"
            />
            Exempt Subject
          </label>
          <Link
            href="/subjects"
            className="px-4 py-2 border border-border hover:bg-zinc-900 text-foreground font-bold text-xs uppercase tracking-widest transition-colors duration-150 rounded-[4px]"
          >
            ← Subjects
          </Link>
          <button
            onClick={launchTest}
            disabled={testCardIds.length === 0}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed rounded-[4px]"
          >
            Test Subject →
          </button>
        </div>
      </div>

      <hr className="border-t border-divider my-6" />

      {kindsInSubject.length > 0 && (
        <div className="flex items-center gap-3 bg-zinc-950/20 border border-border p-3 rounded-[4px] flex-wrap">
          <span className="text-xs uppercase font-bold tracking-wider text-muted">Test Card Kinds:</span>
          <div className="flex items-center gap-2 flex-wrap">
            {kindsInSubject.map((k) => {
              const isSelected = selectedKinds.includes(k);
              const config = KIND_CONFIG[k] || { label: k.toUpperCase(), activeClass: "bg-indigo-600 border-indigo-600 text-white" };
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setSelectedKinds((prev) =>
                      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
                    );
                  }}
                  className={[
                    "px-2.5 py-1 rounded-[4px] border text-xs font-semibold uppercase tracking-wider transition-colors",
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
            {testCardIds.length} of {subjectCards.length} cards selected
          </span>
        </div>
      )}

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
                        {groupCardLen} card{groupCardLen === 1 ? "" : "s"} · {g.videoId ? "YouTube Video" : g.webUrl ? "Web Page" : "Tags"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right pane: Subject Settings & Group Manager panel (span 5) */}
        <div className="md:col-span-5 space-y-6">
          {isEditing && (
            <div className="border border-border p-5 bg-zinc-950/40 rounded-[4px] space-y-4">
              <div>
                <h3 className="text-xs uppercase font-bold tracking-wider text-muted mb-1">
                  Subject Settings
                </h3>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-subject-name" className="text-[10px] uppercase font-bold tracking-wider text-muted">
                  Subject Name
                </label>
                <input
                  id="edit-subject-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Computer Science, Medical Revision..."
                  className="w-full px-3 py-2 border border-border rounded-[4px] bg-transparent text-foreground focus:outline-none focus:border-accent"
                />
              </div>



              <div className="pt-2 border-t border-divider">
                <h4 className="text-[10px] uppercase font-bold tracking-wide text-muted mb-1">
                  Manage Included Groups
                </h4>
                <p className="text-[9px] text-muted uppercase tracking-wide">
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

              <div className="flex gap-2 pt-2 border-t border-divider">
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
                    setExempted(subject.exempted ?? false);
                    setName(subject.name);
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
