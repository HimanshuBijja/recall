import { readDb } from "@/lib/db";
import type { Card, Tag } from "@/types";
import { TagsManager } from "./TagsManager";

export const dynamic = "force-dynamic";

export default function TagsPage() {
  const tags = readDb<Tag>("tags.json");
  const cards = readDb<Card>("cards.json");

  // Pre-compute usage counts so deletion can flag whether a tag is in use.
  const usage: Record<string, number> = {};
  for (const c of cards) {
    for (const t of c.tags) usage[t] = (usage[t] ?? 0) + 1;
  }

  return <TagsManager initialTags={tags} usage={usage} />;
}
