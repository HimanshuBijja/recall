import { NextRequest } from "next/server";
import { readDb } from "@/lib/db";
import type { Card, Review } from "@/types";
import { getReviewsSummary } from "@/lib/due";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const cards = await readDb<Card>("cards.json");
  const reviews = await readDb<Review>("reviews.json");
  const now = new Date();
  const summary = getReviewsSummary(cards, reviews, now);
  return Response.json(summary);
}
