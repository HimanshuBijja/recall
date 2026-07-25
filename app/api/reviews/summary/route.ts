import { readDb } from "@/lib/db";
import type { Card, Review, Group, Subject, Tag } from "@/types";
import { getReviewsSummary } from "@/lib/due";
import { filterExemptedCards } from "@/lib/exemptions";

export const dynamic = "force-dynamic";

export async function GET() {
  const cards = await readDb<Card>("cards.json");
  const reviews = await readDb<Review>("reviews.json");
  const groups = await readDb<Group>("groups.json");
  const subjects = await readDb<Subject>("subjects.json");
  const tags = await readDb<Tag>("tags.json");

  const nonExemptedCards = filterExemptedCards(cards, groups, subjects, tags);

  const now = new Date();
  const summary = getReviewsSummary(nonExemptedCards, reviews, now);
  return Response.json(summary);
}
