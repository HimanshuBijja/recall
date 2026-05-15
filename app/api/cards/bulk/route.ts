import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { Card, Tag } from "@/types";

interface BulkCardInput {
  question: string;
  answer: string;
  distractors: string[];
  explanation?: string;
  hint?: string;
  difficulty?: number;
  /** Tag names — looked up or created. */
  tags?: string[];
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as BulkCardInput[];
  if (!Array.isArray(body)) {
    return Response.json({ error: "expected an array" }, { status: 400 });
  }

  const cards = readDb<Card>("cards.json");
  const tags = readDb<Tag>("tags.json");
  const tagByName = new Map(tags.map((t) => [t.name.toLowerCase(), t]));

  const created: Card[] = [];
  for (const item of body) {
    const tagIds: string[] = [];
    for (const name of item.tags ?? []) {
      const key = name.toLowerCase();
      let tag = tagByName.get(key);
      if (!tag) {
        tag = { id: crypto.randomUUID(), name, parents: [] };
        tags.push(tag);
        tagByName.set(key, tag);
      }
      tagIds.push(tag.id);
    }
    const card: Card = {
      id: crypto.randomUUID(),
      question: item.question,
      answer: item.answer,
      distractors: item.distractors ?? [],
      explanation: item.explanation ?? "",
      hint: item.hint ?? "",
      difficulty: (item.difficulty ?? 3) as Card["difficulty"],
      tags: tagIds,
      createdAt: new Date().toISOString(),
    };
    cards.push(card);
    created.push(card);
  }

  writeDb("tags.json", tags);
  writeDb("cards.json", cards);
  return Response.json({ inserted: created.length, cards: created }, { status: 201 });
}
