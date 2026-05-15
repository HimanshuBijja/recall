"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Card, Tag } from "@/types";
import { TagTree } from "@/components/TagTree";
import { descendantTagIds } from "@/lib/tags";

export function TestSetup({ tags, cards }: { tags: Tag[]; cards: Card[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shuffle, setShuffle] = useState(true);
  const [timed, setTimed] = useState(false);
  const [minDiff, setMinDiff] = useState(1);
  const [maxDiff, setMaxDiff] = useState(5);

  const expandedTagIds = useMemo(
    () => descendantTagIds(tags, [...selected]),
    [tags, selected]
  );

  const matched = useMemo(() => {
    if (selected.size === 0) return cards;
    return cards.filter(
      (c) =>
        c.tags.some((t) => expandedTagIds.has(t)) &&
        c.difficulty >= minDiff &&
        c.difficulty <= maxDiff
    );
  }, [cards, selected, expandedTagIds, minDiff, maxDiff]);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function start() {
    const params = new URLSearchParams();
    params.set("tags", [...selected].join(","));
    params.set("shuffle", String(shuffle));
    params.set("timed", String(timed));
    params.set("min", String(minDiff));
    params.set("max", String(maxDiff));
    router.push(`/test/session?${params.toString()}`);
  }

  return (
    <div className="grid lg:grid-cols-[1fr_22rem] gap-6 pb-24 lg:pb-0">
      <section className="space-y-4 order-2 lg:order-1">
        <h1 className="text-2xl font-bold hidden lg:block">Set up a test</h1>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
          <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
            Pick topics
          </h3>
          {tags.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No tags yet — without tags, all {cards.length} cards will be included.
            </p>
          ) : (
            <TagTree tags={tags} selected={selected} onToggle={toggle} searchable />
          )}
        </div>
      </section>

      <aside className="space-y-4 order-1 lg:order-2">
        <h1 className="text-2xl font-bold lg:hidden">Set up a test</h1>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900 space-y-4">
          <h3 className="font-semibold">Options</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={shuffle}
              onChange={(e) => setShuffle(e.target.checked)}
              className="accent-indigo-600"
            />
            Shuffle cards
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={timed}
              onChange={(e) => setTimed(e.target.checked)}
              className="accent-indigo-600"
            />
            Timed mode (track per-card time)
          </label>
          <div>
            <div className="text-sm mb-1">
              Difficulty {minDiff}–{maxDiff}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={5}
                value={minDiff}
                onChange={(e) =>
                  setMinDiff(Math.min(Math.max(Number(e.target.value), 1), maxDiff))
                }
                className="w-16 px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              />
              <span>to</span>
              <input
                type="number"
                min={1}
                max={5}
                value={maxDiff}
                onChange={(e) =>
                  setMaxDiff(Math.max(Math.min(Number(e.target.value), 5), minDiff))
                }
                className="w-16 px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900 hidden lg:block">
          <div className="text-sm text-zinc-500">Matching cards</div>
          <div className="text-3xl font-bold">{matched.length}</div>
          <button
            onClick={start}
            disabled={matched.length === 0}
            className="mt-3 w-full px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50"
          >
            Start →
          </button>
        </div>
      </aside>

      {/* Mobile sticky action bar — sits above the bottom nav (which is ~44px tall + safe area). */}
      <div className="lg:hidden fixed inset-x-0 bottom-[calc(2.75rem+env(safe-area-inset-bottom))] z-30 bg-background/95 backdrop-blur border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center gap-3">
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Matching</div>
          <div className="text-xl font-bold leading-none">{matched.length}</div>
        </div>
        <button
          onClick={start}
          disabled={matched.length === 0}
          className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50"
        >
          Start →
        </button>
      </div>
    </div>
  );
}
