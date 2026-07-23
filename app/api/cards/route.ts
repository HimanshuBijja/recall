import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { Card, TfStatement } from "@/types";

import { buildCardFromInput } from "./validate";

export async function GET(req: NextRequest) {
  const tag = req.nextUrl.searchParams.get("tag");
  const cards = await readDb<Card>("cards.json");
  const filtered = tag ? cards.filter((c) => c.tags.includes(tag)) : cards;
  return Response.json(filtered);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { card: parsedCard, error } = buildCardFromInput(body);
  if (error) {
    return Response.json({ error }, { status: 400 });
  }
  const cards = await readDb<Card>("cards.json");
  const card: Card = {
    ...parsedCard!,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  cards.push(card);
  await writeDb("cards.json", cards);
  return Response.json(card, { status: 201 });
}
