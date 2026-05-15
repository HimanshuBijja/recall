import { readDb } from "@/lib/db";
import type { Card, Session, Tag, TagStat } from "@/types";
import { AnalyticsView } from "./AnalyticsView";

export const dynamic = "force-dynamic";

export default function AnalyticsPage() {
  const sessions = readDb<Session>("sessions.json");
  const cards = readDb<Card>("cards.json");
  const tags = readDb<Tag>("tags.json");
  const cardById = new Map(cards.map((c) => [c.id, c]));

  const buckets = new Map<string, { total: number; correct: number }>();
  for (const s of sessions) {
    for (const r of s.results) {
      const card = cardById.get(r.cardId);
      if (!card) continue;
      for (const tagId of card.tags) {
        const b = buckets.get(tagId) ?? { total: 0, correct: 0 };
        b.total += 1;
        if (r.correct) b.correct += 1;
        buckets.set(tagId, b);
      }
    }
  }
  const stats: TagStat[] = tags.map((t) => {
    const b = buckets.get(t.id) ?? { total: 0, correct: 0 };
    return {
      tagId: t.id,
      tagName: t.name,
      total: b.total,
      correct: b.correct,
      accuracy: b.total ? Math.round((b.correct / b.total) * 100) : 0,
    };
  });

  return <AnalyticsView sessions={sessions} stats={stats} />;
}
