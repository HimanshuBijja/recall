"use client";

import { useState } from "react";
import type { Tag } from "@/types";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { TagTree } from "@/components/TagTree";

export function TagsManager({ initialTags }: { initialTags: Tag[] }) {
  const toast = useToast();
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [name, setName] = useState("");
  const [parents, setParents] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editParents, setEditParents] = useState<string[]>([]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const res = await api.post<Tag>("/tags", { name: name.trim(), parents });
      setTags((t) => [...t, res.data]);
      setName("");
      setParents([]);
      toast("success", "Tag created");
    } catch {
      toast("error", "Failed to create tag");
    }
  }

  async function update(id: string) {
    try {
      const res = await api.put<Tag>(`/tags/${id}`, { name: editName.trim(), parents: editParents });
      setTags((ts) => ts.map((t) => (t.id === id ? res.data : t)));
      setEditingId(null);
      toast("success", "Tag updated");
    } catch {
      toast("error", "Failed to update tag");
    }
  }

  async function del(id: string) {
    if (!confirm("Delete this tag? It will be removed from any cards.")) return;
    try {
      await api.delete(`/tags/${id}`);
      setTags((ts) =>
        ts.filter((t) => t.id !== id).map((t) => ({ ...t, parents: t.parents.filter((p) => p !== id) }))
      );
      toast("success", "Tag deleted");
    } catch {
      toast("error", "Failed to delete tag");
    }
  }

  function startEdit(t: Tag) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditParents(t.parents);
  }

  return (
    <div className="grid lg:grid-cols-[1fr_22rem] gap-6">
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">Tags</h1>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
          <TagTree
            tags={tags}
            rightSlot={(tag) => (
              <>
                <button
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  onClick={() => startEdit(tag)}
                >
                  edit
                </button>
                <button
                  className="text-xs text-rose-600 dark:text-rose-400 hover:underline"
                  onClick={() => del(tag.id)}
                >
                  delete
                </button>
              </>
            )}
          />
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
                className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-sm"
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

      <aside>
        <form
          onSubmit={create}
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900 space-y-3"
        >
          <h3 className="font-semibold">New tag</h3>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tag name"
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          />
          <ParentPicker tags={tags} selected={parents} onChange={setParents} />
          <button className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-sm font-medium">
            Create
          </button>
        </form>
      </aside>
    </div>
  );
}

function ParentPicker({
  tags,
  selected,
  onChange,
}: {
  tags: Tag[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div>
      <div className="text-xs text-zinc-500 mb-1.5">Parents (optional, supports multiple)</div>
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && <span className="text-xs text-zinc-400">No tags yet.</span>}
        {tags.map((t) => {
          const on = selected.includes(t.id);
          return (
            <button
              type="button"
              key={t.id}
              onClick={() =>
                onChange(on ? selected.filter((x) => x !== t.id) : [...selected, t.id])
              }
              className={[
                "px-2 py-0.5 rounded-full text-xs border",
                on
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300",
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
