import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { Card } from "@/types";

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = (await req.json()) as Partial<Card>;
  const cards = readDb<Card>("cards.json");
  const idx = cards.findIndex((c) => c.id === id);
  if (idx === -1) return Response.json({ error: "not found" }, { status: 404 });
  cards[idx] = { ...cards[idx], ...body, id: cards[idx].id, createdAt: cards[idx].createdAt };
  writeDb("cards.json", cards);
  return Response.json(cards[idx]);
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const cards = readDb<Card>("cards.json");
  const next = cards.filter((c) => c.id !== id);
  if (next.length === cards.length) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  writeDb("cards.json", next);
  return Response.json({ ok: true });
}
