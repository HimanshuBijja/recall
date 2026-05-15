import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { Card } from "@/types";

export async function GET(req: NextRequest) {
  const tag = req.nextUrl.searchParams.get("tag");
  const cards = readDb<Card>("cards.json");
  const filtered = tag ? cards.filter((c) => c.tags.includes(tag)) : cards;
  return Response.json(filtered);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<Card>;
  if (!body.question || !body.answer) {
    return Response.json({ error: "question and answer are required" }, { status: 400 });
  }
  const cards = readDb<Card>("cards.json");
  const card: Card = {
    id: crypto.randomUUID(),
    question: body.question,
    answer: body.answer,
    distractors: body.distractors ?? [],
    explanation: body.explanation ?? "",
    hint: body.hint ?? "",
    difficulty: (body.difficulty ?? 3) as Card["difficulty"],
    tags: body.tags ?? [],
    createdAt: new Date().toISOString(),
  };
  cards.push(card);
  writeDb("cards.json", cards);
  return Response.json(card, { status: 201 });
}
