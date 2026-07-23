import { NextRequest } from "next/server";
import { readDb } from "@/lib/db";
import type { Card, Review } from "@/types";
import { selectDue } from "@/lib/due";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const newLimit = Number(searchParams.get("newLimit") ?? 20);
  const excludeStr = searchParams.get("exclude") ?? "";
  const exclude = excludeStr ? excludeStr.split(",") : [];

  const cards = await readDb<Card>("cards.json");
  const reviews = await readDb<Review>("reviews.json");

  const now = new Date();
  const res = selectDue(cards, reviews, now, { newLimit, exclude });
  return Response.json(res);
}
