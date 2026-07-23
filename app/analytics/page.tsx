import { readDb } from "@/lib/db";
import type { Card, Session, Tag } from "@/types";
import { AnalyticsView } from "./AnalyticsView";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const sessions = await readDb<Session>("sessions.json");
  const cards = await readDb<Card>("cards.json");
  const tags = await readDb<Tag>("tags.json");
  return <AnalyticsView sessions={sessions} cards={cards} tags={tags} />;
}
