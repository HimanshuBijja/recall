import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { Card, Group, Tag } from "@/types";

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = (await req.json()) as Partial<Tag>;
  const tags = readDb<Tag>("tags.json");
  const idx = tags.findIndex((t) => t.id === id);
  if (idx === -1) return Response.json({ error: "not found" }, { status: 404 });
  tags[idx] = {
    ...tags[idx],
    name: body.name ?? tags[idx].name,
    parents: body.parents ?? tags[idx].parents,
  };
  writeDb("tags.json", tags);
  return Response.json(tags[idx]);
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const tags = readDb<Tag>("tags.json");
  const next = tags
    .filter((t) => t.id !== id)
    .map((t) => ({ ...t, parents: t.parents.filter((p) => p !== id) }));
  if (next.length === tags.length) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  writeDb("tags.json", next);

  // Strip the deleted tag from any cards referencing it.
  const cards = readDb<Card>("cards.json");
  const updated = cards.map((c) =>
    c.tags.includes(id) ? { ...c, tags: c.tags.filter((t) => t !== id) } : c
  );
  writeDb("cards.json", updated);

  // ...and from any groups referencing it.
  const groups = readDb<Group>("groups.json");
  const updatedGroups = groups.map((g) =>
    g.tagIds.includes(id) ? { ...g, tagIds: g.tagIds.filter((t) => t !== id) } : g
  );
  writeDb("groups.json", updatedGroups);

  return Response.json({ ok: true });
}
