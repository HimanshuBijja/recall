import Link from "next/link";
import type { Group, Tag } from "@/types";

export function GroupQuickLaunch({ groups, tags }: { groups: Group[]; tags: Tag[] }) {
  const tagById = new Map(tags.map((t) => [t.id, t]));

  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {groups.slice(0, 5).map((g) => {
        const activeTagIds = g.tagIds.filter(tid => tagById.has(tid));
        const names = activeTagIds
          .map((tid) => tagById.get(tid)!.name)
          .slice(0, 3)
          .join(" · ");
        const more = Math.max(0, activeTagIds.length - 3);
        const disabled = activeTagIds.length === 0;
        return (
          <li key={g.id}>
            <Link
              href={`/groups/${g.id}`}
              className="block text-left p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-colors group hover:no-underline"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate text-foreground">{g.name}</span>
                <span className="text-xs text-indigo-600 dark:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  Open →
                </span>
              </div>
              <div className="text-xs text-zinc-500 mt-0.5 truncate">
                {disabled ? "no tags" : names}
                {more > 0 && <span className="opacity-70"> +{more}</span>}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
