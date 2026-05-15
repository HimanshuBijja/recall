import { readDb } from "@/lib/db";
import type { Card, Tag } from "@/types";
import { CardsBrowser } from "./CardsBrowser";

export const dynamic = "force-dynamic";

export default function CardsPage() {
  const cards = readDb<Card>("cards.json");
  const tags = readDb<Tag>("tags.json");
  return <CardsBrowser initialCards={cards} tags={tags} />;
}
