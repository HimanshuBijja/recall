import { readDb } from "@/lib/db";
import type { Card, Review, Tag } from "@/types";
import { DueCardsClient } from "./DueCardsClient";

export const dynamic = "force-dynamic";

export default async function DueCardsPage() {
  const cards = await readDb<Card>("cards.json");
  const reviews = await readDb<Review>("reviews.json");
  const tags = await readDb<Tag>("tags.json");

  return <DueCardsClient cards={cards} reviews={reviews} tags={tags} />;
}
