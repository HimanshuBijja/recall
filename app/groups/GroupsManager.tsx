"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Group, Tag } from "@/types";
import { TagTree } from "@/components/TagTree";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { ExportDialog } from "@/components/ExportDialog";
import { exportGroup, exportGroups } from "@/lib/export";

interface Props {
  initialGroups: Group[];
  tags: Tag[];
  groupCardCounts: Record<string, number>;
}

export function GroupsManager({ initialGroups, tags, groupCardCounts: initialCounts }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [groups, setGroups] = useState<Group[]>(initialGroups);
  const [cardCounts, setCardCounts] = useState<Record<string, number>>(initialCounts);
  const [editor, setEditor] = useState<{ mode: "new" } | { mode: "edit"; group: Group } | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportPayload, setExportPayload] = useState<{
    title: string; filename: string; payload: unknown;
  } | null>(null);

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      if (g.name.toLowerCase().includes(q)) return true;
      return g.tagIds.some((tid) => tagById.get(tid)?.name.toLowerCase().includes(q));
    });
  }, [groups, query, tagById]);

  const visibleIds = useMemo(() => new Set(visibleGroups.map((g) => g.id)), [visibleGroups]);
  const allSelected = visibleGroups.length > 0 && visibleGroups.every((g) => selectedIds.has(g.id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds((s) => {
        const n = new Set(s);
        for (const id of visibleIds) n.delete(id);
        return n;
      });
    } else {
      setSelectedIds((s) => new Set([...s, ...visibleIds]));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function launchTest(g: Group) {
    if (g.videoId) {
      const params = new URLSearchParams();
      params.set("videoId", g.videoId);
      params.set("shuffle", "true");
      params.set("min", "1");
      params.set("max", "5");
      router.push(`/test/session?${params.toString()}`);
      return;
    }
    if (g.webUrl) {
      const params = new URLSearchParams();
      params.set("webUrl", g.webUrl);
      params.set("shuffle", "true");
      params.set("min", "1");
      params.set("max", "5");
      router.push(`/test/session?${params.toString()}`);
      return;
    }
    if (g.tagIds.length === 0) {
      toast("error", "This group has no tags yet");
      return;
    }
    const params = new URLSearchParams();
    params.set("tags", g.tagIds.join(","));
    params.set("shuffle", "true");
    params.set("min", "1");
    params.set("max", "5");
    router.push(`/test/session?${params.toString()}`);
  }

  async function del(g: Group) {
    if (!confirm(`Delete group "${g.name}"?`)) return;
    try {
      await api.delete(`/groups/${g.id}`);
      setGroups((gs) => gs.filter((x) => x.id !== g.id));
      setSelectedIds((s) => { const n = new Set(s); n.delete(g.id); return n; });
      toast("success", "Group deleted");
    } catch {
      toast("error", "Failed to delete group");
    }
  }

  async function deleteSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const ok = confirm(`Delete ${ids.length} group${ids.length === 1 ? "" : "s"}?`);
    if (!ok) return;
    let count = 0;
    for (const id of ids) {
      try {
        await api.delete(`/groups/${id}`);
        count++;
      } catch { /* skip */ }
    }
    setGroups((gs) => gs.filter((g) => !ids.includes(g.id)));
    setSelectedIds(new Set());
    toast("success", `Deleted ${count} group${count === 1 ? "" : "s"}`);
  }

  function onSaved(g: Group, count: number, isNew: boolean) {
    setGroups((gs) =>
      isNew ? [...gs, g] : gs.map((x) => (x.id === g.id ? g : x))
    );
    setCardCounts((c) => ({ ...c, [g.id]: count }));
    setEditor(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 text-xs tracking-widest text-muted uppercase font-semibold mb-2">
            <span className="w-6 h-[2px] bg-accent" />
            Revision Protocol
          </div>
          <h1 className="cinematic-headline text-[10vw] sm:text-[8vw] md:text-[5vw] leading-[0.85] font-display font-bold tracking-tight mb-1" data-text="GROUPS">
            GROUPS
          </h1>
          <p className="text-sm text-muted mt-2 uppercase tracking-wider">
            Saved tag bundles and video chapters you can quiz on with one click.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {groups.length > 0 && (
            <button
              onClick={() =>
                setExportPayload({
                  title: "Export all groups",
                  filename: "groups",
                  payload: exportGroups(groups, tags),
                })
              }
              title="Export all groups"
              aria-label="Export all groups"
              className="inline-flex items-center justify-center px-4 py-2 border border-border hover:bg-zinc-900 text-foreground font-bold text-xs uppercase tracking-widest transition-colors duration-150 rounded-[4px] whitespace-nowrap"
            >
              <DownloadIcon /> <span className="ml-1.5 hidden sm:inline">Export</span>
            </button>
          )}
          <button
            onClick={() => setEditor({ mode: "new" })}
            className="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest transition-colors duration-150 rounded-[4px] whitespace-nowrap"
          >
            + New group
          </button>
        </div>
      </div>

      <hr className="border-t border-divider my-6" />

      {visibleGroups.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={toggleSelectAll}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <span
              className={[
                "w-4 h-4 inline-flex items-center justify-center rounded border text-[10px]",
                allSelected
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "border-zinc-300 dark:border-zinc-700 text-transparent",
              ].join(" ")}
              aria-hidden="true"
            >
              ✓
            </span>
            {allSelected ? "Deselect all" : "Select all"}
          </button>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 ml-auto rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-1">
              <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300 pl-1.5">
                {selectedIds.size} selected
              </span>
              <button
                onClick={() => {
                  const picked = groups.filter((g) => selectedIds.has(g.id));
                  setExportPayload({
                    title: `Export ${picked.length} group${picked.length === 1 ? "" : "s"}`,
                    filename: `groups-selection-${picked.length}`,
                    payload: picked.map((g) => exportGroup(g, tagById)),
                  });
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950"
              >
                <DownloadIcon /> Export
              </button>
              <button
                onClick={deleteSelected}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950"
              >
                ✕ Delete
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-2 py-1 rounded-md text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {groups.length > 0 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search groups or tags…"
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
        />
      )}

      {editor && (
        <GroupEditor
          tags={tags}
          initial={editor.mode === "edit" ? editor.group : null}
          onCancel={() => setEditor(null)}
          onSaved={onSaved}
        />
      )}

      {groups.length === 0 && !editor ? (
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center text-sm text-zinc-500">
          No groups yet. Create one to bundle tags for repeat practice.
        </div>
      ) : visibleGroups.length === 0 ? (
        <p className="text-sm text-zinc-500">No groups match.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleGroups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              tagById={tagById}
              cardCount={cardCounts[g.id] ?? 0}
              selected={selectedIds.has(g.id)}
              onToggle={() => toggleSelect(g.id)}
              onTest={() => launchTest(g)}
              onEdit={() => setEditor({ mode: "edit", group: g })}
              onDelete={() => del(g)}
              onExport={() => setExportPayload({
                title: `Export group "${g.name}"`,
                filename: `group-${g.name}`,
                payload: [exportGroup(g, tagById)],
              })}
            />
          ))}
        </ul>
      )}
      <ExportDialog
        open={exportPayload !== null}
        title={exportPayload?.title ?? ""}
        filename={exportPayload?.filename ?? "export"}
        payload={exportPayload?.payload ?? []}
        onClose={() => setExportPayload(null)}
      />
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function WebIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function GroupCard({
  group, tagById, cardCount, selected, onToggle, onTest, onEdit, onDelete, onExport,
}: {
  group: Group; tagById: Map<string, Tag>; cardCount: number;
  selected: boolean; onToggle: () => void;
  onTest: () => void; onEdit: () => void; onDelete: () => void;
  onExport: () => void;
}) {
  const activeTags = group.tagIds.map(tid => tagById.get(tid)).filter((t): t is Tag => !!t);
  const visibleTags = activeTags.slice(0, 6);
  const overflow = activeTags.length - visibleTags.length;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <li
      className={[
        "rounded-xl border p-4 bg-zinc-950/20 flex flex-col gap-3 transition-colors",
        selected
          ? "border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-200 dark:ring-indigo-900"
          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2 relative">
        <div className="flex items-center gap-2 min-w-0 w-full">
          <span
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className={[
              "shrink-0 w-5 h-5 inline-flex items-center justify-center rounded border text-xs cursor-pointer",
              selected
                ? "bg-indigo-600 border-indigo-600 text-white"
                : "border-zinc-300 dark:border-zinc-700 text-transparent",
            ].join(" ")}
            aria-hidden="true"
          >
            ✓
          </span>
          <Link href={`/groups/${group.id}`} className="min-w-0 hover:no-underline group block w-full text-left">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold truncate group-hover:text-accent transition-colors">{group.name}</h3>
              {group.exempted && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-amber-500/30 uppercase tracking-wider shrink-0">
                  Exempt
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              {group.videoId ? "YouTube Video" : group.webUrl ? "Web Page" : `${group.tagIds.length} tag${group.tagIds.length === 1 ? "" : "s"}`} ·{" "}
              {cardCount} card{cardCount === 1 ? "" : "s"}
            </p>
          </Link>
        </div>

        {/* Dropdown Container on top right */}
        <div className="relative shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
            className="p-1 text-zinc-500 hover:text-indigo-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus:outline-none cursor-pointer border-0"
            aria-label="Actions menu"
          >
            <span className="font-bold text-sm leading-none block">⋮</span>
          </button>

          {menuOpen && (
            <>
              {/* Overlay transparent layer to close on click outside */}
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
              <div className="absolute right-0 top-full mt-1 w-36 rounded-md shadow-lg bg-zinc-900 border border-border py-1 z-20">
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(); }}
                  className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-zinc-800 flex items-center gap-2 cursor-pointer border-0"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  Edit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onExport(); }}
                  className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-zinc-800 flex items-center gap-2 cursor-pointer border-0"
                >
                  <DownloadIcon />
                  Download
                </button>
                <hr className="border-t border-divider my-1" />
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                  className="w-full text-left px-3 py-2 text-xs text-rose-500 hover:bg-zinc-800 flex items-center gap-2 cursor-pointer border-0"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 min-h-[1.5rem]">
        {activeTags.length === 0 ? (
          <span className="text-xs text-zinc-400 italic">No tags in this group</span>
        ) : (
          <>
            {visibleTags.map((tag) => (
              <span
                key={tag.id}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
              >
                {tag.name}
              </span>
            ))}
            {overflow > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 text-zinc-500">+{overflow}</span>
            )}
          </>
        )}
      </div>

      <div className="flex gap-2 mt-auto items-center justify-between">
        {group.videoUrl && (
          <a
            href={group.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-indigo-600 hover:border-indigo-300 dark:hover:border-indigo-800"
            title="Watch video on YouTube"
          >
            <VideoIcon />
          </a>
        )}
        {group.webUrl && (
          <a
            href={group.webUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-indigo-600 hover:border-indigo-300 dark:hover:border-indigo-800"
            title="Visit web source"
          >
            <WebIcon />
          </a>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onTest(); }}
          disabled={cardCount === 0}
          className="flex-1 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          title={cardCount === 0 ? "No cards match this group" : undefined}
        >
          Test →
        </button>
      </div>
    </li>
  );
}

function GroupEditor({
  tags, initial, onCancel, onSaved,
}: {
  tags: Tag[]; initial: Group | null;
  onCancel: () => void; onSaved: (g: Group, cardCount: number, isNew: boolean) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initial?.tagIds ?? [])
  );
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function save() {
    if (!name.trim()) {
      toast("error", "Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        tagIds: [...selected],
        exempted: initial ? initial.exempted : false,
      };
      if (initial) {
        const res = await api.put<Group>(`/groups/${initial.id}`, payload);
        // Card count needs server-side recomputation — easiest path is a
        // hard refresh of the page, but for now just reuse the selection size
        // and let the next mount fix it precisely.
        onSaved(res.data, payload.tagIds.length, false);
        toast("success", "Group updated");
      } else {
        const res = await api.post<Group>("/groups", payload);
        onSaved(res.data, payload.tagIds.length, true);
        toast("success", "Group created");
      }
    } catch {
      toast("error", "Failed to save group");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cinematic-editor-panel space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-divider/30">
        <h3 className="font-semibold text-sm uppercase tracking-wider text-foreground">
          {initial ? "Edit group" : "New group"}
        </h3>
        <button
          onClick={onCancel}
          className="text-xs text-muted hover:text-accent font-bold uppercase tracking-wider transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase font-bold tracking-wider text-muted">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='e.g. "Frontend revision", "JS quirks"'
          autoFocus
          className="mt-1 w-full px-4 py-2.5 rounded-[4px] border border-border/50 bg-black/40 text-foreground placeholder-zinc-600 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all duration-150"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label className="text-[10px] uppercase font-bold tracking-wider text-muted">Tags</label>
          <span className="text-xs text-accent font-mono font-semibold">{selected.size} selected</span>
        </div>
        <div className="rounded-[4px] border border-border/30 bg-black/40 p-3.5 max-h-80 overflow-y-auto">
          <TagTree tags={tags} selected={selected} onToggle={toggle} searchable />
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t border-divider/40">
        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-2.5 bg-accent hover:bg-accent/80 text-background font-bold text-xs uppercase tracking-widest transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed rounded-[4px]"
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Create group"}
        </button>
        <button
          onClick={onCancel}
          className="px-6 py-2.5 border border-border/60 hover:bg-zinc-900 text-foreground font-bold text-xs uppercase tracking-widest transition-all duration-150 rounded-[4px]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
