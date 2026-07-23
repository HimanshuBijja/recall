import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { Card } from "@/types";

import { buildCardFromInput } from "./validate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const tag = params.get("tag");
  const videoId = params.get("videoId");
  const cards = await readDb<Card>("cards.json");
  if (videoId) {
    return Response.json(
      cards
        .filter((c) => c.source?.videoId === videoId)
        .map((c) => ({ id: c.id, kind: c.kind ?? "mcq", timestamp: c.source!.timestamp, marker: c.source!.marker })),
    );
  }
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
