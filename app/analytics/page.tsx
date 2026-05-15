import { readDb } from "@/lib/db";
import type { Card, Session, Tag } from "@/types";
import { AnalyticsView } from "./AnalyticsView";

export const dynamic = "force-dynamic";

export default function AnalyticsPage() {
  const sessions = readDb<Session>("sessions.json");
  const cards = readDb<Card>("cards.json");
  const tags = readDb<Tag>("tags.json");
  return <AnalyticsView sessions={sessions} cards={cards} tags={tags} />;
}
