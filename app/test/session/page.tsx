import { readDb } from "@/lib/db";
import type { Card, Tag } from "@/types";
import { TestSession } from "./TestSession";

export const dynamic = "force-dynamic";

export default function TestSessionPage() {
  const cards = readDb<Card>("cards.json");
  const tags = readDb<Tag>("tags.json");
  return <TestSession cards={cards} tags={tags} />;
}
