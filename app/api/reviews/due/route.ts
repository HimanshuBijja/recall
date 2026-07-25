import { NextRequest } from "next/server";
import { readDb } from "@/lib/db";
import type { Card, Review, Group, Subject, Tag } from "@/types";
import { selectDue } from "@/lib/due";
import { filterExemptedCards } from "@/lib/exemptions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const newLimit = Number(searchParams.get("newLimit") ?? 20);
  const excludeStr = searchParams.get("exclude") ?? "";
  const exclude = excludeStr ? excludeStr.split(",") : [];

  const cards = await readDb<Card>("cards.json");
  const reviews = await readDb<Review>("reviews.json");
  const groups = await readDb<Group>("groups.json");
  const subjects = await readDb<Subject>("subjects.json");
  const tags = await readDb<Tag>("tags.json");

  const nonExemptedCards = filterExemptedCards(cards, groups, subjects, tags);

  const now = new Date();
  const res = selectDue(nonExemptedCards, reviews, now, { newLimit, exclude });
  return Response.json(res);
}
