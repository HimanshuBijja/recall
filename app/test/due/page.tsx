import { readDb } from "@/lib/db";
import type { Card, Review, Tag, Group, Subject } from "@/types";
import { DueCardsClient } from "./DueCardsClient";
import { filterExemptedCards } from "@/lib/exemptions";

export const dynamic = "force-dynamic";

export default async function DueCardsPage() {
  const cards = await readDb<Card>("cards.json");
  const reviews = await readDb<Review>("reviews.json");
  const tags = await readDb<Tag>("tags.json");
  const groups = await readDb<Group>("groups.json");
  const subjects = await readDb<Subject>("subjects.json");

  const nonExemptedCards = filterExemptedCards(cards, groups, subjects, tags);

  return <DueCardsClient cards={nonExemptedCards} reviews={reviews} tags={tags} />;
}
