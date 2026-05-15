import type { Tag } from "@/types";

export interface TagTreeNode {
  tag: Tag;
  children: TagTreeNode[];
  /** True when this node is reachable from multiple parents (shared in the DAG). */
  shared: boolean;
}

/**
 * Build a tag tree from a flat list of tags. Tags may have multiple parents
 * (DAG). Cycles are broken by skipping already-visited ancestors on a path.
 * Nodes with more than one parent are emitted under each parent but flagged
 * `shared = true` so the UI can render them once cleanly.
 */
export function flattenDag(tags: Tag[]): TagTreeNode[] {
  const byId = new Map(tags.map((t) => [t.id, t]));
  const parentCount = new Map<string, number>();
  for (const t of tags) {
    for (const p of t.parents) {
      if (byId.has(p)) parentCount.set(t.id, (parentCount.get(t.id) ?? 0) + 1);
    }
  }

  // Children index
  const childrenOf = new Map<string, string[]>();
  for (const t of tags) {
    const parents = t.parents.filter((p) => byId.has(p));
    if (parents.length === 0) continue;
    for (const p of parents) {
      const list = childrenOf.get(p) ?? [];
      list.push(t.id);
      childrenOf.set(p, list);
    }
  }

  const roots = tags.filter(
    (t) => t.parents.filter((p) => byId.has(p)).length === 0
  );

  const build = (tag: Tag, ancestors: Set<string>): TagTreeNode => {
    const next = new Set(ancestors);
    next.add(tag.id);
    const kids = (childrenOf.get(tag.id) ?? [])
      .filter((cid) => !next.has(cid)) // break cycles
      .map((cid) => build(byId.get(cid)!, next));
    return {
      tag,
      children: kids,
      shared: (parentCount.get(tag.id) ?? 0) > 1,
    };
  };

  return roots.map((r) => build(r, new Set()));
}

/** Return the set of tag IDs reachable downward from any of the given roots. */
export function descendantTagIds(tags: Tag[], rootIds: string[]): Set<string> {
  const byId = new Map(tags.map((t) => [t.id, t]));
  const childrenOf = new Map<string, string[]>();
  for (const t of tags) {
    for (const p of t.parents) {
      if (!byId.has(p)) continue;
      const list = childrenOf.get(p) ?? [];
      list.push(t.id);
      childrenOf.set(p, list);
    }
  }
  const out = new Set<string>();
  const stack = [...rootIds];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    if (!byId.has(id)) continue;
    out.add(id);
    for (const c of childrenOf.get(id) ?? []) stack.push(c);
  }
  return out;
}
