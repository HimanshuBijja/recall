"use client";

import { useMemo, useState } from "react";
import type { Tag } from "@/types";
import { flattenDag, type TagTreeNode } from "@/lib/tags";

type SelectionFilter = "all" | "selected" | "unselected";

interface Props {
  tags: Tag[];
  /** When defined, render selectable rows and call back on toggle. */
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  /** Optional renderer for trailing controls (edit, delete). */
  rightSlot?: (tag: Tag) => React.ReactNode;
  /** Show a search input and filter chips above the tree. */
  searchable?: boolean;
}

export function TagTree({ tags, selected, onToggle, rightSlot, searchable }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SelectionFilter>("all");

  const selectable = !!(selected && onToggle);
  const q = query.trim().toLowerCase();
  const isSearching = q.length > 0;
  const isFiltering = selectable && filter !== "all";

  const tree = useMemo(() => flattenDag(tags), [tags]);

  // When searching or filtering, render a flat alphabetical list so users
  // don't have to traverse the DAG to find what they're looking for.
  const flatList = useMemo(() => {
    return tags
      .filter((t) => {
        if (q && !t.name.toLowerCase().includes(q)) return false;
        if (selectable) {
          const isSel = selected!.has(t.id);
          if (filter === "selected" && !isSel) return false;
          if (filter === "unselected" && isSel) return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tags, q, filter, selectable, selected]);

  const counts = useMemo(() => {
    if (!selectable) return { selected: 0, unselected: 0 };
    let sel = 0;
    for (const t of tags) if (selected!.has(t.id)) sel += 1;
    return { selected: sel, unselected: tags.length - sel };
  }, [tags, selectable, selected]);

  if (tags.length === 0) {
    return <p className="text-sm text-zinc-500">No tags yet.</p>;
  }

  const renderTree = !isSearching && !isFiltering;

  return (
    <div className="space-y-2">
      {searchable && (
        <div className="space-y-2">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tags…"
              className="w-full pl-8 pr-8 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 text-sm pointer-events-none">
              ⌕
            </span>
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-sm"
              >
                ×
              </button>
            )}
          </div>
          {selectable && (
            <div className="flex flex-wrap gap-1">
              {([
                ["all", "All", tags.length],
                ["selected", "Selected", counts.selected],
                ["unselected", "Unselected", counts.unselected],
              ] as const).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  disabled={count === 0 && key !== "all"}
                  className={[
                    "px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors",
                    filter === key
                      ? "bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900 dark:border-white"
                      : "border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
                    count === 0 && key !== "all" && "opacity-30 cursor-not-allowed",
                  ].filter(Boolean).join(" ")}
                >
                  {label} <span className="opacity-60">({count})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {renderTree ? (
        <ul className="space-y-1">
          {tree.map((n) => (
            <TreeNode
              key={n.tag.id + ":root"}
              node={n}
              depth={0}
              seen={new Set()}
              selected={selected}
              onToggle={onToggle}
              rightSlot={rightSlot}
            />
          ))}
        </ul>
      ) : flatList.length === 0 ? (
        <p className="text-sm text-zinc-500 py-2">No matches.</p>
      ) : (
        <ul className="space-y-1">
          {flatList.map((t) => (
            <FlatRow
              key={t.id}
              tag={t}
              selected={selected}
              onToggle={onToggle}
              rightSlot={rightSlot}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FlatRow({
  tag,
  selected,
  onToggle,
  rightSlot,
}: {
  tag: Tag;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  rightSlot?: (tag: Tag) => React.ReactNode;
}) {
  const selectable = !!(selected && onToggle);
  const isSelected = selectable && selected!.has(tag.id);
  return (
    <li>
      <div
        role={selectable ? "button" : undefined}
        tabIndex={selectable ? 0 : undefined}
        aria-pressed={selectable ? isSelected : undefined}
        onClick={() => selectable && onToggle!(tag.id)}
        onKeyDown={(e) => {
          if (!selectable) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle!(tag.id);
          }
        }}
        className={[
          "flex items-center gap-2 py-1 rounded-md px-1 transition-colors",
          selectable && "cursor-pointer",
          isSelected
            ? "bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-950/60"
            : "hover:bg-zinc-100 dark:hover:bg-zinc-800/60",
        ].filter(Boolean).join(" ")}
      >
        <span className="w-4" />
        {selectable && (
          <span
            aria-hidden="true"
            className={[
              "shrink-0 w-5 h-5 inline-flex items-center justify-center rounded border text-xs",
              isSelected
                ? "bg-indigo-600 border-indigo-600 text-white"
                : "border-zinc-300 dark:border-zinc-700 text-transparent",
            ].join(" ")}
          >
            ✓
          </span>
        )}
        <span
          className={[
            "text-sm flex-1 truncate",
            isSelected && "font-medium text-indigo-700 dark:text-indigo-300",
          ].filter(Boolean).join(" ")}
        >
          {tag.name}
        </span>
        {rightSlot && (
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {rightSlot(tag)}
          </div>
        )}
      </div>
    </li>
  );
}

function TreeNode({
  node,
  depth,
  seen,
  selected,
  onToggle,
  rightSlot,
}: {
  node: TagTreeNode;
  depth: number;
  seen: Set<string>;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  rightSlot?: (tag: Tag) => React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const alreadyShown = seen.has(node.tag.id);
  const next = new Set(seen);
  next.add(node.tag.id);
  const hasKids = node.children.length > 0;

  const selectable = !!(selected && onToggle);
  const isSelected = selectable && selected!.has(node.tag.id);

  return (
    <li>
      <div
        role={selectable ? "button" : undefined}
        tabIndex={selectable ? 0 : undefined}
        aria-pressed={selectable ? isSelected : undefined}
        onClick={() => selectable && onToggle!(node.tag.id)}
        onKeyDown={(e) => {
          if (!selectable) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle!(node.tag.id);
          }
        }}
        className={[
          "flex items-center gap-2 py-1 rounded-md px-1 transition-colors",
          selectable && "cursor-pointer",
          isSelected
            ? "bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-950/60"
            : "hover:bg-zinc-100 dark:hover:bg-zinc-800/60",
        ].filter(Boolean).join(" ")}
        style={{ paddingLeft: depth * 16 + 4 }}
      >
        {hasKids ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            className="w-4 text-zinc-400 text-xs"
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4" />
        )}
        {selectable && (
          <span
            aria-hidden="true"
            className={[
              "shrink-0 w-5 h-5 inline-flex items-center justify-center rounded border text-xs",
              isSelected
                ? "bg-indigo-600 border-indigo-600 text-white"
                : "border-zinc-300 dark:border-zinc-700 text-transparent",
            ].join(" ")}
          >
            ✓
          </span>
        )}
        <span
          className={[
            "text-sm flex-1 truncate",
            isSelected && "font-medium text-indigo-700 dark:text-indigo-300",
          ].filter(Boolean).join(" ")}
        >
          {node.tag.name}
          {node.shared && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
              shared
            </span>
          )}
        </span>
        {rightSlot && (
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {rightSlot(node.tag)}
          </div>
        )}
      </div>
      {hasKids && open && !alreadyShown && (
        <ul>
          {node.children.map((c) => (
            <TreeNode
              key={node.tag.id + ">" + c.tag.id}
              node={c}
              depth={depth + 1}
              seen={next}
              selected={selected}
              onToggle={onToggle}
              rightSlot={rightSlot}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
