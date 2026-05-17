"use client";

import { useMemo, useState } from "react";
import type { BinItem, BinItemKind } from "@/types";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";

const KIND_LABELS: Record<BinItemKind, string> = { tag: "Tag", card: "Card", group: "Group" };
const KIND_COLORS: Record<BinItemKind, string> = {
  tag: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
  card: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
  group: "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
};

type Filter = "all" | BinItemKind;

export function BinManager({ initialItems }: { initialItems: BinItem[] }) {
  const toast = useToast();
  const [items, setItems] = useState<BinItem[]>(initialItems);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    let list = items;
    if (filter !== "all") list = list.filter((i) => i.kind === filter);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((i) => i.name.toLowerCase().includes(q));
    return list.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
  }, [items, filter, query]);

  const filteredIds = useMemo(() => new Set(filtered.map((i) => i.id)), [filtered]);
  const allSelected = filtered.length > 0 && filtered.every((i) => selectedIds.has(i.id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds((s) => {
        const n = new Set(s);
        for (const id of filteredIds) n.delete(id);
        return n;
      });
    } else {
      setSelectedIds((s) => new Set([...s, ...filteredIds]));
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

  async function restoreSelected() {
    const ids = [...selectedIds].filter((id) => filteredIds.has(id) || selectedIds.has(id));
    if (ids.length === 0) return;
    try {
      await api.post("/bin/restore", { ids });
      setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
      setSelectedIds(new Set());
      toast("success", `Restored ${ids.length} item${ids.length === 1 ? "" : "s"}`);
    } catch {
      toast("error", "Failed to restore");
    }
  }

  async function permanentDeleteSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const ok = confirm(`Permanently delete ${ids.length} item${ids.length === 1 ? "" : "s"}? This cannot be undone.`);
    if (!ok) return;
    try {
      await api.post("/bin/bulk-delete", { ids });
      setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
      setSelectedIds(new Set());
      toast("success", `Permanently deleted ${ids.length} item${ids.length === 1 ? "" : "s"}`);
    } catch {
      toast("error", "Failed to delete");
    }
  }

  async function emptyBin() {
    if (items.length === 0) return;
    const ok = confirm(`Permanently delete all ${items.length} items? This cannot be undone.`);
    if (!ok) return;
    try {
      await api.post("/bin/bulk-delete", { ids: items.map((i) => i.id) });
      setItems([]);
      setSelectedIds(new Set());
      toast("success", "Bin emptied");
    } catch {
      toast("error", "Failed to empty bin");
    }
  }

  function daysLeft(deletedAt: string) {
    const elapsed = Date.now() - new Date(deletedAt).getTime();
    return Math.max(0, 30 - Math.floor(elapsed / (24 * 60 * 60 * 1000)));
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, tag: 0, card: 0, group: 0 };
    for (const i of items) c[i.kind] = (c[i.kind] ?? 0) + 1;
    return c;
  }, [items]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bin</h1>
          <p className="text-sm text-zinc-500">
            Deleted items are automatically removed after 30 days.
          </p>
        </div>
        {items.length > 0 && (
          <button
            onClick={emptyBin}
            className="px-3 py-1.5 rounded-md border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-sm font-medium hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors whitespace-nowrap"
          >
            Empty bin
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "tag", "card", "group"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={[
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              filter === f
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
            ].join(" ")}
          >
            {f === "all" ? "All" : KIND_LABELS[f]}
            {counts[f] > 0 && (
              <span className="ml-1.5 text-[10px] font-mono opacity-70">
                {counts[f]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search + bulk actions */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bin…"
          className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
        />
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
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
                onClick={restoreSelected}
                className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium whitespace-nowrap"
              >
                Restore {selectedIds.size}
              </button>
              <button
                onClick={permanentDeleteSelected}
                className="px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium whitespace-nowrap"
              >
                Delete forever
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm whitespace-nowrap"
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        {filtered.length === 0 ? (
          <p className="text-sm text-zinc-500 p-6 text-center">
            {items.length === 0 ? "Bin is empty." : "No items match your filter."}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filtered.map((item) => {
              const sel = selectedIds.has(item.id);
              return (
                <li
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleSelect(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleSelect(item.id);
                    }
                  }}
                  aria-pressed={sel}
                  className={[
                    "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors group",
                    sel
                      ? "bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-950/60"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
                  ].join(" ")}
                >
                  {/* Checkbox */}
                  <span
                    className={[
                      "shrink-0 w-5 h-5 inline-flex items-center justify-center rounded border text-xs",
                      sel
                        ? "bg-indigo-600 border-indigo-600 text-white"
                        : "border-zinc-300 dark:border-zinc-700 text-transparent group-hover:text-zinc-300 dark:group-hover:text-zinc-700",
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    ✓
                  </span>

                  {/* Kind badge */}
                  <span
                    className={[
                      "text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0",
                      KIND_COLORS[item.kind],
                    ].join(" ")}
                  >
                    {KIND_LABELS[item.kind]}
                  </span>

                  {/* Name */}
                  <span
                    className={[
                      "text-sm flex-1 min-w-0 truncate",
                      sel && "font-medium text-indigo-700 dark:text-indigo-300",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {item.name}
                  </span>

                  {/* Days left */}
                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded shrink-0 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                    {daysLeft(item.deletedAt)}d left
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
