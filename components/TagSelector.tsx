"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Tag } from "@/types";

export interface TagSelectorHandle {
  focus(): void;
}

export interface TagSelectorValue {
  /** IDs of existing tags that are selected. */
  existing: string[];
  /** Names of new tags the user wants to create. Persisted on parent's save. */
  pending: string[];
}

interface Props {
  allTags: Tag[];
  value: TagSelectorValue;
  onChange: (next: TagSelectorValue) => void;
}

/**
 * Tag picker with autocomplete and "create-on-save" semantics.
 *
 * Picking an existing tag adds its id to `value.existing`. Choosing "+ Create"
 * adds the name to `value.pending` — the parent form is responsible for
 * actually creating those tags (POST /api/tags) at submit time, which avoids
 * polluting the tag list with typos.
 */
export const TagSelector = forwardRef<TagSelectorHandle, Props>(function TagSelector(
  { allTags, value, onChange },
  ref
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  const byId = useMemo(() => new Map(allTags.map((t) => [t.id, t])), [allTags]);
  const selectedExisting = value.existing
    .map((id) => byId.get(id))
    .filter(Boolean) as Tag[];

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const taken = new Set(value.existing);
    const available = allTags.filter((t) => !taken.has(t.id));
    if (!q) return available.slice(0, 8);
    const scored = available
      .map((t) => {
        const name = t.name.toLowerCase();
        let score = 0;
        if (name === q) score = 1000;
        else if (name.startsWith(q)) score = 500 - (name.length - q.length);
        else if (name.includes(q)) score = 200 - name.indexOf(q);
        return { t, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, 8).map((x) => x.t);
  }, [query, allTags, value.existing]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    if (allTags.some((t) => t.name.toLowerCase() === q)) return "existing" as const;
    if (value.pending.some((n) => n.toLowerCase() === q)) return "pending" as const;
    return null;
  }, [query, allTags, value.pending]);

  const canCreate = query.trim().length > 0 && !exactMatch;
  const totalItems = suggestions.length + (canCreate ? 1 : 0);

  function clampHighlight(next: number) {
    if (totalItems === 0) return 0;
    return ((next % totalItems) + totalItems) % totalItems;
  }

  function pickIndex(i: number) {
    if (i < suggestions.length) {
      const t = suggestions[i];
      onChange({ ...value, existing: [...value.existing, t.id] });
    } else if (canCreate) {
      onChange({ ...value, pending: [...value.pending, query.trim()] });
    }
    setQuery("");
    setHighlight(0);
  }

  function removeExisting(id: string) {
    onChange({ ...value, existing: value.existing.filter((x) => x !== id) });
  }
  function removePending(name: string) {
    onChange({ ...value, pending: value.pending.filter((n) => n !== name) });
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => clampHighlight(h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => clampHighlight(h - 1));
    } else if (e.key === "Enter") {
      if (totalItems === 0) return; // let parent form submit
      e.preventDefault();
      pickIndex(highlight);
    } else if (e.key === "Backspace" && query === "") {
      // Remove the last chip, preferring pending then existing.
      if (value.pending.length > 0) {
        e.preventDefault();
        removePending(value.pending[value.pending.length - 1]);
      } else if (value.existing.length > 0) {
        e.preventDefault();
        removeExisting(value.existing[value.existing.length - 1]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === ",") {
      e.preventDefault();
      if (totalItems > 0) pickIndex(highlight);
    }
  }

  return (
    <div className="space-y-2">
      <div
        className="min-h-[42px] w-full px-2 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex flex-wrap items-center gap-1.5 focus-within:ring-2 focus-within:ring-indigo-500 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {selectedExisting.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
          >
            {t.name}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeExisting(t.id);
              }}
              aria-label={`Remove ${t.name}`}
              className="w-4 h-4 inline-flex items-center justify-center rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-800"
            >
              ×
            </button>
          </span>
        ))}
        {value.pending.map((name) => (
          <span
            key={"p:" + name}
            className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
            title="Will be created when you save the card"
          >
            {name}
            <span className="text-[9px] uppercase tracking-wide opacity-70">new</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removePending(name);
              }}
              aria-label={`Remove ${name}`}
              className="w-4 h-4 inline-flex items-center justify-center rounded-full hover:bg-emerald-200 dark:hover:bg-emerald-800"
            >
              ×
            </button>
          </span>
        ))}
        <div className="relative flex-1 min-w-[8rem]">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKey}
            placeholder={
              selectedExisting.length + value.pending.length === 0
                ? "Search or create tag…"
                : ""
            }
            className="w-full bg-transparent outline-none text-sm py-1"
          />
          {open && totalItems > 0 && (
            <ul className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden">
              {suggestions.map((t, i) => (
                <li
                  key={t.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickIndex(i);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={[
                    "px-3 py-1.5 text-sm cursor-pointer flex items-center justify-between",
                    highlight === i
                      ? "bg-indigo-600 text-white"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800",
                  ].join(" ")}
                >
                  <span>{t.name}</span>
                  <span className="text-[10px] opacity-70">↵ select</span>
                </li>
              ))}
              {canCreate && (
                <li
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickIndex(suggestions.length);
                  }}
                  onMouseEnter={() => setHighlight(suggestions.length)}
                  className={[
                    "px-3 py-1.5 text-sm cursor-pointer flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800",
                    highlight === suggestions.length
                      ? "bg-emerald-600 text-white"
                      : "text-emerald-700 dark:text-emerald-400 hover:bg-zinc-100 dark:hover:bg-zinc-800",
                  ].join(" ")}
                >
                  <span>
                    + Create <strong>&quot;{query.trim()}&quot;</strong>{" "}
                    <span className="opacity-70 text-[10px]">(on save)</span>
                  </span>
                  <span className="text-[10px] opacity-70">↵ create</span>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
      <p className="text-[11px] text-zinc-500">
        <kbd className="px-1 rounded bg-zinc-100 dark:bg-zinc-800">↵</kbd> picks the highlighted tag.
        New tags (<span className="text-emerald-600 dark:text-emerald-400">green</span>) are created when you save the card.
      </p>
    </div>
  );
});
