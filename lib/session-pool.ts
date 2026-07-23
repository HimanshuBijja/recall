import type { Card } from "@/types";

export interface PoolOpts {
  ids?: string[];
  tagIds?: string[];
  expanded?: Set<string>;
  minDiff: number;
  maxDiff: number;
}

export function selectPool(cards: Card[], opts: PoolOpts): Card[] {
  if (opts.ids && opts.ids.length > 0) {
    const want = new Set(opts.ids);
    return cards.filter((c) => want.has(c.id));
  }
  const inTags =
    opts.tagIds && opts.tagIds.length > 0 && opts.expanded
      ? (c: Card) => c.tags.some((t) => opts.expanded!.has(t))
      : () => true;
  return cards.filter(
    (c) => inTags(c) && c.difficulty >= opts.minDiff && c.difficulty <= opts.maxDiff
  );
}
