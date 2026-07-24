import { readDb } from "@/lib/db";
import type { Card, Group, Tag } from "@/types";
import { descendantTagIds } from "@/lib/tags";
import { GroupsManager } from "./GroupsManager";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const groups = await readDb<Group>("groups.json");
  const tags = await readDb<Tag>("tags.json");
  const cards = await readDb<Card>("cards.json");

  // Pre-compute card count for each group so the list can show coverage without
  // shipping all cards to the client.
  const groupCardCounts: Record<string, number> = {};
  for (const g of groups) {
    if (g.videoId) {
      groupCardCounts[g.id] = cards.filter((c) => c.source?.videoId === g.videoId).length;
    } else {
      const expanded = descendantTagIds(tags, g.tagIds);
      groupCardCounts[g.id] = cards.filter((c) =>
        c.tags.some((t) => expanded.has(t))
      ).length;
    }
  }

  return <GroupsManager initialGroups={groups} tags={tags} groupCardCounts={groupCardCounts} />;
}
