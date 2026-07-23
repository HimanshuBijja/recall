import { readDb } from "@/lib/db";
import type { Card, Tag } from "@/types";
import { TestSession } from "./TestSession";

export const dynamic = "force-dynamic";

export default async function TestSessionPage() {
  const cards = await readDb<Card>("cards.json");
  const tags = await readDb<Tag>("tags.json");
  return <TestSession cards={cards} tags={tags} />;
}
