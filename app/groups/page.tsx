import { readDb } from "@/lib/db";
import type { Card, Group, Tag } from "@/types";
import { descendantTagIds } from "@/lib/tags";
import { GroupsManager } from "./GroupsManager";

export const dynamic = "force-dynamic";

export default function GroupsPage() {
  const groups = readDb<Group>("groups.json");
  const tags = readDb<Tag>("tags.json");
  const cards = readDb<Card>("cards.json");

  // Pre-compute card count for each group so the list can show coverage without
  // shipping all cards to the client.
  const groupCardCounts: Record<string, number> = {};
  for (const g of groups) {
    const expanded = descendantTagIds(tags, g.tagIds);
    groupCardCounts[g.id] = cards.filter((c) =>
      c.tags.some((t) => expanded.has(t))
    ).length;
  }

  return <GroupsManager initialGroups={groups} tags={tags} groupCardCounts={groupCardCounts} />;
}
