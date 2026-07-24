"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Card, Group, Tag } from "@/types";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { descendantTagIds } from "@/lib/tags";

export function GroupDetailClient({
  group: initialGroup,
  tags,
  cards,
}: {
  group: Group;
  tags: Tag[];
  cards: Card[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [group, setGroup] = useState<Group>(initialGroup);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialGroup.tagIds);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  // Compute matching cards for this group
  const matchingCards = useMemo(() => {
    if (group.videoId) {
      return cards.filter((c) => c.source?.videoId === group.videoId);
    } else {
      const expanded = descendantTagIds(tags, group.tagIds);
      return cards.filter((c) => c.tags.some((t) => expanded.has(t)));
    }
  }, [group, cards, tags]);

  const cardIds = useMemo(() => matchingCards.map((c) => c.id), [matchingCards]);

  function toggleTag(tid: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tid) ? prev.filter((id) => id !== tid) : [...prev, tid]
    );
  }

  async function handleSaveChanges() {
    setSaving(true);
    try {
      const res = await api.put<Group>(`/groups/${group.id}`, {
        name: group.name,
        tagIds: selectedTagIds,
      });
      setGroup(res.data);
      toast("success", "Group tags updated successfully");
      setIsEditing(false);
      router.refresh();
    } catch {
      toast("error", "Failed to update group tags");
    } finally {
      setSaving(false);
    }
  }

  function launchTest() {
    if (cardIds.length === 0) {
      toast("error", "No cards available in this group");
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
            Group Details & Cards List
          </div>
          <h1 className="cinematic-headline text-[5vw] md:text-[3.5vw] sm:text-[5vw] leading-[0.85] font-display font-bold tracking-tight mb-1" data-text={group.name}>
            {group.name}
          </h1>
          <p className="text-xs text-muted font-mono mt-1">
            {matchingCards.length} matching card{matchingCards.length === 1 ? "" : "s"} inside
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/groups"
            className="px-4 py-2 border border-border hover:bg-zinc-900 text-foreground font-bold text-xs uppercase tracking-widest transition-colors duration-150 rounded-[4px]"
          >
            ← Groups
          </Link>
          <button
            onClick={launchTest}
            disabled={matchingCards.length === 0}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed rounded-[4px]"
          >
            Test Group →
          </button>
        </div>
      </div>

      <hr className="border-t border-divider my-6" />

      {group.videoUrl && (
        <div className="border border-border p-4 bg-zinc-950/20 rounded-[4px] flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-muted mb-0.5">Associated YouTube Link</div>
            <a
              href={group.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent hover:underline break-all font-mono"
            >
              {group.videoUrl}
            </a>
          </div>
          <a
            href={group.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 border border-border hover:border-accent text-foreground font-bold text-[10px] uppercase tracking-wider transition-colors duration-150 rounded-[4px]"
          >
            Watch Video ↗
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Left column: Cards list (span 8 or full depending on editing state) */}
        <div className={group.videoId ? "md:col-span-12 space-y-4" : "md:col-span-8 space-y-4"}>
          <div className="flex justify-between items-center">
            <h2 className="text-xs uppercase font-bold tracking-wider text-muted">
              Cards in this group
            </h2>
            {!group.videoId && (
              <button
                onClick={() => {
                  setSelectedTagIds(group.tagIds);
                  setIsEditing((prev) => !prev);
                }}
                className="text-xs text-accent hover:underline font-bold uppercase tracking-wider"
              >
                {isEditing ? "Hide Tag Config" : "Manage Tag Config"}
              </button>
            )}
          </div>

          {matchingCards.length === 0 ? (
            <div className="border border-dashed border-border p-12 text-center text-sm text-muted rounded-[4px] bg-zinc-950/10">
              No cards are currently matching this group's parameters.
            </div>
          ) : (
            <div className="border border-border rounded-[4px] overflow-hidden bg-zinc-950/10 divide-y divide-divider">
              {matchingCards.map((c) => (
                <div
                  key={c.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-zinc-900/20 transition-colors"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] uppercase font-mono font-semibold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-border">
                        {c.kind}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground truncate max-w-xl">
                      {c.question}
                    </h3>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {c.tags.map((tid) => {
                        const t = tagById.get(tid);
                        return t ? (
                          <span key={tid} className="text-[9px] font-semibold text-muted">
                            #{t.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted font-mono">
                      Diff: {c.difficulty}
                    </span>
                    <Link
                      href={`/test/session?ids=${c.id}`}
                      className="px-3 py-1.5 border border-border hover:border-accent text-foreground font-bold text-[10px] uppercase tracking-wider transition-colors duration-150 rounded-[4px]"
                    >
                      Test →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: Manage Tags config panel (span 4) */}
        {!group.videoId && isEditing && (
          <div className="md:col-span-4 space-y-4">
            <div className="border border-border p-5 bg-zinc-950/40 rounded-[4px] space-y-4">
              <div>
                <h3 className="text-xs uppercase font-bold tracking-wider text-muted mb-1">
                  Configure Group Tags
                </h3>
                <p className="text-[10px] text-muted uppercase tracking-wide">
                  Select tags. Cards matching these tags (and descendants) will automatically enter the group.
                </p>
              </div>

              {tags.length === 0 ? (
                <p className="text-xs text-muted italic">No tags exist in database.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto p-1 border border-border bg-background/30 rounded-[4px]">
                  {tags.map((t) => {
                    const isSelected = selectedTagIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTag(t.id)}
                        className={[
                          "w-full flex items-center justify-between p-2.5 border text-left rounded-[4px] transition-colors text-xs",
                          isSelected
                            ? "border-accent bg-zinc-900"
                            : "border-border hover:bg-zinc-900/30",
                        ].join(" ")}
                      >
                        <span className="font-semibold truncate max-w-[150px]">{t.name}</span>
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
                    setSelectedTagIds(group.tagIds);
                    setIsEditing(false);
                  }}
                  className="px-4 py-2 border border-border hover:bg-zinc-900 text-foreground font-bold text-xs uppercase tracking-widest transition-colors duration-150 rounded-[4px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
