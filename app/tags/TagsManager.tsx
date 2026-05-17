"use client";

import { useMemo, useState } from "react";
import type { Tag } from "@/types";
import { flattenDag, type TagTreeNode } from "@/lib/tags";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";

interface Props {
  initialTags: Tag[];
  usage: Record<string, number>;
}

export function TagsManager({ initialTags, usage: initialUsage }: Props) {
  const toast = useToast();
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [usage, setUsage] = useState<Record<string, number>>(initialUsage);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editParents, setEditParents] = useState<string[]>([]);

  const tree = useMemo(() => flattenDag(tags), [tags]);
  const q = query.trim().toLowerCase();

  const flatFiltered = useMemo(() => {
    if (!q) return null;
    return tags
      .filter((t) => t.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tags, q]);

  // All visible tag IDs for "Select all"
  const visibleTagIds = useMemo(() => {
    if (flatFiltered) return flatFiltered.map((t) => t.id);
    return tags.map((t) => t.id);
  }, [flatFiltered, tags]);

  const allSelected = visibleTagIds.length > 0 && visibleTagIds.every((id) => selectedIds.has(id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleTagIds));
    }
  }

  async function update(id: string) {
    try {
      const res = await api.put<Tag>(`/tags/${id}`, {
        name: editName.trim(),
        parents: editParents,
      });
      setTags((ts) => ts.map((t) => (t.id === id ? res.data : t)));
      setEditingId(null);
      toast("success", "Tag updated");
    } catch {
      toast("error", "Failed to update tag");
    }
  }

  async function deleteOne(id: string, opts: { skipConfirm?: boolean } = {}) {
    const count = usage[id] ?? 0;
    if (!opts.skipConfirm && count > 0) {
      const ok = confirm(
        `"${tags.find((t) => t.id === id)?.name}" is used by ${count} card${count === 1 ? "" : "s"}. Delete anyway?`
      );
      if (!ok) return false;
    }
    try {
      await api.delete(`/tags/${id}`);
      setTags((ts) =>
        ts
          .filter((t) => t.id !== id)
          .map((t) => ({ ...t, parents: t.parents.filter((p) => p !== id) }))
      );
      setSelectedIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      setUsage((u) => {
        const n = { ...u };
        delete n[id];
        return n;
      });
      return true;
    } catch {
      toast("error", "Failed to delete tag");
      return false;
    }
  }

  async function deleteSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const usedCount = ids.filter((id) => (usage[id] ?? 0) > 0).length;
    const ok = confirm(
      `Delete ${ids.length} tag${ids.length === 1 ? "" : "s"}${
        usedCount > 0 ? ` (${usedCount} in use)` : ""
      }?`
    );
    if (!ok) return;
    let ok2 = 0;
    for (const id of ids) {
      if (await deleteOne(id, { skipConfirm: true })) ok2 += 1;
    }
    setSelectedIds(new Set());
    toast("success", `Deleted ${ok2} tag${ok2 === 1 ? "" : "s"}`);
  }

  function toggleSelect(id: string) {
    setSelectedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function startEdit(t: Tag) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditParents(t.parents);
  }

  return (
    <div className="space-y-4">
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold">Tags</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSelectAll}
              className="px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
            {selectedIds.size > 0 && (
              <>
                <button
                  onClick={deleteSelected}
                  className="px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium"
                >
                  Delete {selectedIds.size} selected
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tags…"
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
        />

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          {tags.length === 0 ? (
            <p className="text-sm text-zinc-500 p-4">No tags yet.</p>
          ) : flatFiltered ? (
            flatFiltered.length === 0 ? (
              <p className="text-sm text-zinc-500 p-4">No matches.</p>
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {flatFiltered.map((t) => (
                  <TagRow
                    key={t.id}
                    tag={t}
                    depth={0}
                    shared={false}
                    usage={usage[t.id] ?? 0}
                    selected={selectedIds.has(t.id)}
                    onSelect={() => toggleSelect(t.id)}
                    onEdit={() => startEdit(t)}
                    onDelete={() => deleteOne(t.id)}
                  />
                ))}
              </ul>
            )
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {tree.map((node) => (
                <TreeRow
                  key={node.tag.id}
                  node={node}
                  depth={0}
                  seen={new Set()}
                  usage={usage}
                  selectedIds={selectedIds}
                  onSelect={toggleSelect}
                  onEdit={startEdit}
                  onDelete={(id) => deleteOne(id)}
                />
              ))}
            </ul>
          )}
        </div>

        {editingId && (
          <div className="rounded-xl border border-indigo-300 dark:border-indigo-700 p-4 bg-indigo-50/40 dark:bg-indigo-950/30 space-y-3">
            <h3 className="font-semibold text-sm">Edit tag</h3>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            />
            <ParentPicker
              tags={tags.filter((t) => t.id !== editingId)}
              selected={editParents}
              onChange={setEditParents}
            />
            <div className="flex gap-2">
              <button
                onClick={() => update(editingId)}
                className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-sm font-medium"
              >
                Save
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function TreeRow({
  node, depth, seen, usage, selectedIds, onSelect, onEdit, onDelete,
}: {
  node: TagTreeNode; depth: number; seen: Set<string>;
  usage: Record<string, number>; selectedIds: Set<string>;
  onSelect: (id: string) => void; onEdit: (t: Tag) => void; onDelete: (id: string) => void;
}) {
  const next = new Set(seen);
  next.add(node.tag.id);
  const alreadyShown = seen.has(node.tag.id);
  return (
    <>
      <TagRow
        tag={node.tag} depth={depth} shared={node.shared}
        usage={usage[node.tag.id] ?? 0} selected={selectedIds.has(node.tag.id)}
        onSelect={() => onSelect(node.tag.id)}
        onEdit={() => onEdit(node.tag)}
        onDelete={() => onDelete(node.tag.id)}
      />
      {!alreadyShown &&
        node.children.map((c) => (
          <TreeRow
            key={node.tag.id + ">" + c.tag.id} node={c} depth={depth + 1}
            seen={next} usage={usage} selectedIds={selectedIds}
            onSelect={onSelect} onEdit={onEdit} onDelete={onDelete}
          />
        ))}
    </>
  );
}

function TagRow({
  tag, depth, shared, usage, selected, onSelect, onEdit, onDelete,
}: {
  tag: Tag; depth: number; shared: boolean; usage: number;
  selected: boolean; onSelect: () => void; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <li
      role="button" tabIndex={0} onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      aria-pressed={selected}
      className={[
        "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors group",
        selected
          ? "bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-950/60"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
      ].join(" ")}
    >
      <span
        className={[
          "shrink-0 w-5 h-5 inline-flex items-center justify-center rounded border text-xs",
          selected
            ? "bg-indigo-600 border-indigo-600 text-white"
            : "border-zinc-300 dark:border-zinc-700 text-transparent group-hover:text-zinc-300 dark:group-hover:text-zinc-700",
        ].join(" ")}
        aria-hidden="true"
      >
        ✓
      </span>
      <span style={{ paddingLeft: depth * 14 }} />
      <span
        className={[
          "text-sm flex-1 min-w-0 truncate flex items-center gap-2",
          selected && "font-medium text-indigo-700 dark:text-indigo-300",
        ].filter(Boolean).join(" ")}
      >
        {tag.name}
        {shared && (
          <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400 shrink-0">
            shared
          </span>
        )}
      </span>
      <span
        className={[
          "text-[11px] font-mono px-1.5 py-0.5 rounded shrink-0",
          usage > 0
            ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
            : "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400",
        ].join(" ")}
        title={usage > 0 ? `${usage} card${usage === 1 ? "" : "s"} use this tag` : "unused"}
      >
        {usage}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        aria-label="Edit tag"
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400"
        title="Edit"
      >
        ✎
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        aria-label="Delete tag"
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950 text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400"
        title={usage > 0 ? `Delete (used by ${usage})` : "Delete"}
      >
        ✕
      </button>
    </li>
  );
}

function ParentPicker({
  tags, selected, onChange,
}: {
  tags: Tag[]; selected: string[]; onChange: (next: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = q
    ? tags.filter((t) => t.name.toLowerCase().includes(q.toLowerCase())).slice(0, 12)
    : tags.slice(0, 12);
  return (
    <div>
      <div className="text-xs text-zinc-500 mb-1.5">Parents (optional)</div>
      {tags.length > 8 && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter parents…"
          className="w-full px-2 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 mb-2"
        />
      )}
      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
        {tags.length === 0 && <span className="text-xs text-zinc-400">No tags yet.</span>}
        {filtered.map((t) => {
          const on = selected.includes(t.id);
          return (
            <button
              type="button" key={t.id}
              onClick={() => onChange(on ? selected.filter((x) => x !== t.id) : [...selected, t.id])}
              className={[
                "px-2 py-0.5 rounded-full text-xs border",
                on
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
              ].join(" ")}
            >
              {t.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
