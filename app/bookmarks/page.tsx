import { readDb } from "@/lib/db";
import type { Card, Tag } from "@/types";
import { BookmarksView } from "./BookmarksView";

export const dynamic = "force-dynamic";

export default async function BookmarksPage() {
  const cards = await readDb<Card>("cards.json");
  const tags = await readDb<Tag>("tags.json");
  const bookmarkedCards = cards.filter((c) => c.bookmarked);
  return <BookmarksView initialCards={bookmarkedCards} tags={tags} />;
}
