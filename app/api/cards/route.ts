import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { Card, TfStatement } from "@/types";

function normalizeStatements(raw: unknown): TfStatement[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => {
      if (s && typeof s === "object") {
        const o = s as { text?: unknown; isTrue?: unknown };
        return { text: String(o.text ?? "").trim(), isTrue: Boolean(o.isTrue) };
      }
      return { text: "", isTrue: false };
    })
    .filter((s) => s.text.length > 0);
}

export async function GET(req: NextRequest) {
  const tag = req.nextUrl.searchParams.get("tag");
  const cards = readDb<Card>("cards.json");
  const filtered = tag ? cards.filter((c) => c.tags.includes(tag)) : cards;
  return Response.json(filtered);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<Card>;
  const kind = body.kind === "tf-sort" ? "tf-sort" : "mcq";
  if (!body.question) {
    return Response.json({ error: "question is required" }, { status: 400 });
  }
  if (kind === "mcq" && !body.answer) {
    return Response.json({ error: "answer is required for mcq cards" }, { status: 400 });
  }
  const statements = normalizeStatements(body.statements);
  if (kind === "tf-sort" && statements.length < 2) {
    return Response.json(
      { error: "tf-sort cards need at least 2 statements" },
      { status: 400 }
    );
  }
  const cards = readDb<Card>("cards.json");
  const card: Card = {
    id: crypto.randomUUID(),
    kind,
    question: body.question,
    answer: body.answer ?? "",
    distractors: body.distractors ?? [],
    statements: kind === "tf-sort" ? statements : undefined,
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
