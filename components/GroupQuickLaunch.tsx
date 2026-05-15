"use client";

import { useRouter } from "next/navigation";
import type { Group, Tag } from "@/types";

export function GroupQuickLaunch({ groups, tags }: { groups: Group[]; tags: Tag[] }) {
  const router = useRouter();
  const tagById = new Map(tags.map((t) => [t.id, t]));

  function launch(g: Group) {
    if (g.tagIds.length === 0) return;
    const params = new URLSearchParams();
    params.set("tags", g.tagIds.join(","));
    params.set("shuffle", "true");
    params.set("min", "1");
    params.set("max", "5");
    router.push(`/test/session?${params.toString()}`);
  }

  return (
    <ul className="grid sm:grid-cols-2 gap-2">
      {groups.slice(0, 6).map((g) => {
        const names = g.tagIds
          .map((tid) => tagById.get(tid)?.name)
          .filter(Boolean)
          .slice(0, 3)
          .join(" · ");
        const more = Math.max(0, g.tagIds.length - 3);
        const disabled = g.tagIds.length === 0;
        return (
          <li key={g.id}>
            <button
              onClick={() => launch(g)}
              disabled={disabled}
              className="w-full text-left p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate">{g.name}</span>
                <span className="text-xs text-indigo-600 dark:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  Test →
                </span>
              </div>
              <div className="text-xs text-zinc-500 mt-0.5 truncate">
                {disabled ? "no tags" : names}
                {more > 0 && <span className="opacity-70"> +{more}</span>}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
