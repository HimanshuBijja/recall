import { readDb } from "@/lib/db";
import type { Card, Session, Tag, Review, Group, Subject } from "@/types";
import { AnalyticsView } from "./AnalyticsView";
import { filterExemptedCards } from "@/lib/exemptions";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const sessions = await readDb<Session>("sessions.json");
  const cards = await readDb<Card>("cards.json");
  const tags = await readDb<Tag>("tags.json");
  const reviews = await readDb<Review>("reviews.json");
  const groups = await readDb<Group>("groups.json");
  const subjects = await readDb<Subject>("subjects.json");

  const nonExemptedCards = filterExemptedCards(cards, groups, subjects, tags);

  return <AnalyticsView sessions={sessions} cards={nonExemptedCards} tags={tags} reviews={reviews} />;
}
