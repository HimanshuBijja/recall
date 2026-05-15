"use client";

import { useState } from "react";
import type { Tag } from "@/types";
import { flattenDag, type TagTreeNode } from "@/lib/tags";

interface Props {
  tags: Tag[];
  /** When defined, render checkboxes and call back on toggle. */
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  /** Optional renderer for trailing controls (edit, delete). */
  rightSlot?: (tag: Tag) => React.ReactNode;
}

export function TagTree({ tags, selected, onToggle, rightSlot }: Props) {
  const tree = flattenDag(tags);
  if (tree.length === 0) {
    return <p className="text-sm text-zinc-500">No tags yet.</p>;
  }
  return (
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

  return (
    <li>
      <div
        className="flex items-center gap-2 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/60 px-1"
        style={{ paddingLeft: depth * 16 + 4 }}
      >
        {hasKids ? (
          <button
            onClick={() => setOpen((o) => !o)}
            className="w-4 text-zinc-400 text-xs"
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4" />
        )}
        {selected && onToggle && (
          <input
            type="checkbox"
            checked={selected.has(node.tag.id)}
            onChange={() => onToggle(node.tag.id)}
            className="accent-indigo-600"
          />
        )}
        <span className="text-sm flex-1 truncate">
          {node.tag.name}
          {node.shared && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
              shared
            </span>
          )}
        </span>
        {rightSlot && <div className="flex items-center gap-1">{rightSlot(node.tag)}</div>}
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
