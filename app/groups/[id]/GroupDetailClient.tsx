"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Card, Group, Tag } from "@/types";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { descendantTagIds } from "@/lib/tags";

const KIND_LABELS: Record<string, string> = {
  mcq: "Multiple Choice",
  multi: "Multiple Answer",
  flash: "Flashcard",
  cloze: "Cloze Deletion",
  "tf-sort": "True / False",
  match: "Match Pairs",
};

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
  const [exempted, setExempted] = useState(initialGroup.exempted ?? false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingExempt, setSavingExempt] = useState(false);

  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagFilter, setSelectedTagFilter] = useState("");
  const [selectedKindFilter, setSelectedKindFilter] = useState("");
  const [deletingCards, setDeletingCards] = useState(false);
  const [activeMenuCardId, setActiveMenuCardId] = useState<string | null>(null);

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  // Compute matching cards for this group
  const matchingCards = useMemo(() => {
    if (group.videoId) {
      return cards.filter((c) => c.source?.videoId === group.videoId);
    } else if (group.webUrl) {
      return cards.filter((c) => c.source?.type === "web" && c.source.url === group.webUrl);
    } else {
      const expanded = descendantTagIds(tags, group.tagIds);
      return cards.filter((c) => c.tags.some((t) => expanded.has(t)));
    }
  }, [group, cards, tags]);

  const cardIds = useMemo(() => matchingCards.map((c) => c.id), [matchingCards]);

  const filteredCards = useMemo(() => {
    return matchingCards.filter((c) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = !q || c.question.toLowerCase().includes(q) || c.answer.toLowerCase().includes(q);
      const matchesTag = !selectedTagFilter || c.tags.includes(selectedTagFilter);
      const matchesKind = !selectedKindFilter || c.kind === selectedKindFilter;
      return matchesSearch && matchesTag && matchesKind;
    });
  }, [matchingCards, searchQuery, selectedTagFilter, selectedKindFilter]);

  const uniqueTagsInGroup = useMemo(() => {
    const tIds = new Set<string>();
    for (const c of matchingCards) {
      for (const tid of c.tags) {
        tIds.add(tid);
      }
    }
    return Array.from(tIds).map((tid) => tagById.get(tid)).filter(Boolean) as Tag[];
  }, [matchingCards, tagById]);

  const uniqueKindsInGroup = useMemo(() => {
    const kinds = new Set<string>();
    for (const c of matchingCards) {
      if (c.kind) kinds.add(c.kind);
    }
    return Array.from(kinds);
  }, [matchingCards]);

  const allFilteredSelected = filteredCards.length > 0 && filteredCards.every((c) => selectedCardIds.includes(c.id));

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      setSelectedCardIds((prev) => {
        const filteredIds = new Set(filteredCards.map((c) => c.id));
        return prev.filter((id) => !filteredIds.has(id));
      });
    } else {
      setSelectedCardIds((prev) => {
        const next = new Set(prev);
        for (const c of filteredCards) {
          next.add(c.id);
        }
        return Array.from(next);
      });
    }
  }

  function toggleSelectCard(cardId: string) {
    setSelectedCardIds((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]
    );
  }

  async function deleteCards(ids: string[]) {
    if (ids.length === 0) return;
    const ok = confirm(`Delete ${ids.length} card${ids.length === 1 ? "" : "s"}? This will soft-delete them to the recycle bin.`);
    if (!ok) return;

    setDeletingCards(true);
    try {
      await api.delete("/cards/bulk", { data: { ids } });
      toast("success", `Deleted ${ids.length} card${ids.length === 1 ? "" : "s"}`);
      setSelectedCardIds([]);
      router.refresh();
    } catch {
      toast("error", "Failed to delete cards");
    } finally {
      setDeletingCards(false);
    }
  }

  function toggleTag(tid: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tid) ? prev.filter((id) => id !== tid) : [...prev, tid]
    );
  }

  async function handleToggleExempt(checked: boolean) {
    setSavingExempt(true);
    setExempted(checked);
    try {
      const res = await api.put<Group>(`/groups/${group.id}`, {
        name: group.name,
        tagIds: group.tagIds,
        exempted: checked,
      });
      setGroup(res.data);
      toast("success", checked ? "Group exempted from spaced repetition" : "Group included in spaced repetition");
      router.refresh();
    } catch {
      toast("error", "Failed to update group settings");
      setExempted(!checked); // revert state on failure
    } finally {
      setSavingExempt(false);
    }
  }

  async function handleSaveChanges() {
    setSaving(true);
    try {
      const res = await api.put<Group>(`/groups/${group.id}`, {
        name: group.name,
        tagIds: selectedTagIds,
        exempted: exempted,
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
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="cinematic-headline text-[5vw] md:text-[3.5vw] sm:text-[5vw] leading-[0.85] font-display font-bold tracking-tight mb-1" data-text={group.name}>
              {group.name}
            </h1>
            {group.exempted && (
              <span className="text-xs font-bold px-2 py-1 rounded bg-amber-500/20 text-amber-500 border border-amber-500/30 uppercase tracking-widest shrink-0">
                Exempt
              </span>
            )}
          </div>
          <p className="text-xs text-muted font-mono mt-1">
            {matchingCards.length} matching card{matchingCards.length === 1 ? "" : "s"} inside
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
            Exempt Group
          </label>
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

      {group.webUrl && (
        <div className="border border-border p-4 bg-zinc-950/20 rounded-[4px] flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-muted mb-0.5">Associated Web Source</div>
            <a
              href={group.webUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent hover:underline break-all font-mono"
            >
              {group.webUrl}
            </a>
          </div>
          <a
            href={group.webUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 border border-border hover:border-accent text-foreground font-bold text-[10px] uppercase tracking-wider transition-colors duration-150 rounded-[4px]"
          >
            Visit Website ↗
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Left column: Cards list (span 8 or full depending on editing state) */}
        <div className={!group.videoId && !group.webUrl && isEditing ? "md:col-span-8 space-y-4" : "md:col-span-12 space-y-4"}>
          <div className="flex justify-between items-center">
            <h2 className="text-xs uppercase font-bold tracking-wider text-muted">
              Cards in this group
            </h2>
            {!group.videoId && !group.webUrl && (
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

          {matchingCards.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 bg-zinc-900/40 p-3 rounded-[4px] border border-border">
              {/* Search Bar */}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search group cards..."
                className="flex-1 min-w-[200px] px-3 py-1.5 border border-border bg-black/45 text-foreground text-sm rounded-[4px] focus:outline-none focus:border-accent"
              />

              {/* Tag Filter */}
              <select
                value={selectedTagFilter}
                onChange={(e) => setSelectedTagFilter(e.target.value)}
                className="px-3 py-1.5 border border-border bg-zinc-900 text-zinc-100 text-sm rounded-[4px] focus:outline-none focus:border-accent cursor-pointer"
              >
                <option value="" className="bg-zinc-900 text-zinc-100">All Tags</option>
                {uniqueTagsInGroup.map((t) => (
                  <option key={t.id} value={t.id} className="bg-zinc-900 text-zinc-100">
                    {t.name}
                  </option>
                ))}
              </select>

              {/* Card Type Filter */}
              <select
                value={selectedKindFilter}
                onChange={(e) => setSelectedKindFilter(e.target.value)}
                className="px-3 py-1.5 border border-border bg-zinc-900 text-zinc-100 text-sm rounded-[4px] focus:outline-none focus:border-accent cursor-pointer"
              >
                <option value="" className="bg-zinc-900 text-zinc-100">All Card Types</option>
                {uniqueKindsInGroup.map((k) => (
                  <option key={k} value={k} className="bg-zinc-900 text-zinc-100">
                    {KIND_LABELS[k] || k}
                  </option>
                ))}
              </select>

              {/* Action Buttons */}
              <div className="flex gap-2 ml-auto">
                {selectedCardIds.length > 0 && (
                  <button
                    type="button"
                    disabled={deletingCards}
                    onClick={() => deleteCards(selectedCardIds)}
                    className="px-3 py-1.5 border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-bold text-xs uppercase tracking-wider rounded-[4px] transition-colors disabled:opacity-40"
                  >
                    Delete Selected ({selectedCardIds.length})
                  </button>
                )}
                <button
                  type="button"
                  disabled={deletingCards}
                  onClick={() => deleteCards(matchingCards.map((c) => c.id))}
                  className="px-3 py-1.5 border border-rose-500/30 hover:border-rose-500 hover:bg-rose-500/10 text-rose-500 font-bold text-xs uppercase tracking-wider rounded-[4px] transition-colors"
                >
                  Delete All Cards
                </button>
              </div>
            </div>
          )}

          {/* Select all checkbox for filtered cards */}
          {filteredCards.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-zinc-950/20 border-x border-t border-border rounded-t-[4px]">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAllFiltered}
                className="w-4 h-4 accent-accent cursor-pointer rounded"
              />
              <span className="text-xs text-muted uppercase tracking-wider font-semibold">
                Select All Filtered ({filteredCards.length})
              </span>
            </div>
          )}

          {filteredCards.length === 0 ? (
            <div className="border border-dashed border-border p-12 text-center text-sm text-muted rounded-[4px] bg-zinc-950/10">
              {matchingCards.length === 0 
                ? "No cards are currently matching this group's parameters."
                : "No cards match the search query and tag filter."}
            </div>
          ) : (
            <div className="border border-border rounded-b-[4px] overflow-hidden bg-zinc-950/10 divide-y divide-divider">
              {filteredCards.map((c) => {
                const isSelected = selectedCardIds.includes(c.id);
                return (
                  <div
                    key={c.id}
                    className="p-4 flex flex-row items-center gap-4 hover:bg-zinc-900/20 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectCard(c.id)}
                      className="w-4 h-4 accent-accent cursor-pointer rounded shrink-0"
                    />
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] uppercase font-mono font-semibold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-border">
                          {c.kind}
                        </span>
                        {c.exempted && (
                          <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-full bg-amber-950/45 text-amber-500 border border-amber-500/30">
                            Exempted
                          </span>
                        )}
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

                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuCardId(activeMenuCardId === c.id ? null : c.id);
                          }}
                          className="p-1 text-muted hover:text-foreground rounded transition-colors duration-150 flex items-center justify-center"
                          title="Card Actions"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                          </svg>
                        </button>
                        
                        {activeMenuCardId === c.id && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setActiveMenuCardId(null)}
                            />
                            <div className="absolute right-0 mt-1 w-36 rounded border border-border bg-zinc-950 shadow-lg z-20 py-1 font-sans text-xs text-left">
                              <button
                                type="button"
                                onClick={async () => {
                                  setActiveMenuCardId(null);
                                  try {
                                    await api.put(`/cards/${c.id}`, { ...c, exempted: !c.exempted });
                                    toast("success", c.exempted ? "Card included in study" : "Card exempted from study");
                                    router.refresh();
                                  } catch {
                                    toast("error", "Failed to update card exemption status");
                                  }
                                }}
                                className="w-full text-left px-3 py-1.5 hover:bg-zinc-900 text-foreground transition-colors duration-150"
                              >
                                {c.exempted ? "Include Card" : "Exempt Card"}
                              </button>
                              <Link
                                href={`/cards/${c.id}/edit`}
                                className="block w-full text-left px-3 py-1.5 hover:bg-zinc-900 text-foreground transition-colors duration-150"
                              >
                                Edit Card
                              </Link>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuCardId(null);
                                  deleteCards([c.id]);
                                }}
                                className="w-full text-left px-3 py-1.5 hover:bg-zinc-900 text-rose-500 transition-colors duration-150"
                              >
                                Delete Card
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column: Manage Tags config panel (span 4) */}
        {!group.videoId && !group.webUrl && isEditing && (
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
