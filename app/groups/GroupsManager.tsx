"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Groups</h1>
          <p className="text-sm text-zinc-500">Saved tag bundles you can quiz on with one click.</p>
        </div>
        <div className="flex items-center gap-2">
          {visibleGroups.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap"
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          )}
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={() => {
                  const picked = groups.filter((g) => selectedIds.has(g.id));
                  setExportPayload({
                    title: `Export ${picked.length} group${picked.length === 1 ? "" : "s"}`,
                    filename: `groups-selection-${picked.length}`,
                    payload: picked.map((g) => exportGroup(g, tagById)),
                  });
                }}
                className="px-3 py-1.5 rounded-md border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-sm font-medium hover:bg-emerald-50 dark:hover:bg-emerald-950/40 whitespace-nowrap"
              >
                Export {selectedIds.size}
              </button>
              <button
                onClick={deleteSelected}
                className="px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium whitespace-nowrap"
              >
                Delete {selectedIds.size}
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm whitespace-nowrap"
              >
                Clear
              </button>
            </>
          )}
          {groups.length > 0 && selectedIds.size === 0 && (
            <button
              onClick={() =>
                setExportPayload({
                  title: "Export all groups",
                  filename: "groups",
                  payload: exportGroups(groups, tags),
                })
              }
              className="px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 whitespace-nowrap"
            >
              Export all
            </button>
          )}
          <button
            onClick={() => setEditor({ mode: "new" })}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium whitespace-nowrap"
          >
            + New group
          </button>
        </div>
      </div>

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
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
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

function GroupCard({
  group, tagById, cardCount, selected, onToggle, onTest, onEdit, onDelete, onExport,
}: {
  group: Group; tagById: Map<string, Tag>; cardCount: number;
  selected: boolean; onToggle: () => void;
  onTest: () => void; onEdit: () => void; onDelete: () => void;
  onExport: () => void;
}) {
  const visibleTags = group.tagIds.slice(0, 6);
  const overflow = group.tagIds.length - visibleTags.length;
  return (
    <li
      onClick={onToggle}
      className={[
        "rounded-xl border p-4 bg-white dark:bg-zinc-900 flex flex-col gap-3 cursor-pointer transition-colors",
        selected
          ? "border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-200 dark:ring-indigo-900"
          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={[
              "shrink-0 w-5 h-5 inline-flex items-center justify-center rounded border text-xs",
              selected
                ? "bg-indigo-600 border-indigo-600 text-white"
                : "border-zinc-300 dark:border-zinc-700 text-transparent",
            ].join(" ")}
            aria-hidden="true"
          >
            ✓
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{group.name}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {group.tagIds.length} tag{group.tagIds.length === 1 ? "" : "s"} ·{" "}
              {cardCount} card{cardCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 min-h-[1.5rem]">
        {group.tagIds.length === 0 ? (
          <span className="text-xs text-zinc-400 italic">No tags in this group</span>
        ) : (
          <>
            {visibleTags.map((tid) => (
              <span
                key={tid}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
              >
                {tagById.get(tid)?.name ?? "(deleted)"}
              </span>
            ))}
            {overflow > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 text-zinc-500">+{overflow}</span>
            )}
          </>
        )}
      </div>

      <div className="flex gap-2 mt-auto">
        <button
          onClick={(e) => { e.stopPropagation(); onTest(); }}
          disabled={cardCount === 0}
          className="flex-1 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          title={cardCount === 0 ? "No cards match this group's tags" : undefined}
        >
          Test →
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onExport(); }}
          aria-label="Export group"
          title="Export"
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-500 hover:text-emerald-600 hover:border-emerald-300 dark:hover:border-emerald-800"
        >
          ⤓
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Edit
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label="Delete group"
          className="px-2 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-500 hover:text-rose-600 hover:border-rose-300 dark:hover:border-rose-800"
          title="Delete"
        >
          ✕
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
      const payload = { name: name.trim(), tagIds: [...selected] };
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
    <div className="rounded-xl border border-indigo-300 dark:border-indigo-800 p-4 bg-indigo-50/40 dark:bg-indigo-950/30 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{initial ? "Edit group" : "New group"}</h3>
        <button
          onClick={onCancel}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Cancel
        </button>
      </div>

      <div>
        <label className="text-xs uppercase tracking-wide text-zinc-500">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='e.g. "Frontend revision", "JS quirks"'
          autoFocus
          className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1">
          <label className="text-xs uppercase tracking-wide text-zinc-500">Tags</label>
          <span className="text-xs text-zinc-500">{selected.size} selected</span>
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2 max-h-80 overflow-y-auto">
          <TagTree tags={tags} selected={selected} onToggle={toggle} searchable />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Create group"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
