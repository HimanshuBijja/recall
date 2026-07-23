import { readDb } from "@/lib/db";
import type { Card, Tag } from "@/types";
import { CardsBrowser } from "./CardsBrowser";

export const dynamic = "force-dynamic";

export default async function CardsPage() {
  const cards = await readDb<Card>("cards.json");
  const tags = await readDb<Tag>("tags.json");
  return <CardsBrowser initialCards={cards} tags={tags} />;
}
