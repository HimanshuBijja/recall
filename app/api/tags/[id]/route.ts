import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { BinItem, Card, Group, Tag } from "@/types";

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
  const deleted = tags.find((t) => t.id === id);
  if (!deleted) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  // Soft-delete to bin
  const now = new Date().toISOString();
  const bin = readDb<BinItem>("bin.json");
  bin.push({
    id: deleted.id,
    kind: "tag",
    name: deleted.name,
    data: { ...deleted },
    deletedAt: now,
  });

  const next = tags
    .filter((t) => t.id !== id)
    .map((t) => ({ ...t, parents: t.parents.filter((p) => p !== id) }));
  writeDb("tags.json", next);

  // Strip the deleted tag from any cards referencing it.
  const cards = readDb<Card>("cards.json");
  const updated = cards.map((c) =>
    c.tags.includes(id) ? { ...c, tags: c.tags.filter((t) => t !== id) } : c
  );
  writeDb("cards.json", updated);

  // Strip from groups; auto-delete groups left with zero tags.
  const groups = readDb<Group>("groups.json");
  const updatedGroups = groups.map((g) =>
    g.tagIds.includes(id) ? { ...g, tagIds: g.tagIds.filter((t) => t !== id) } : g
  );
  const emptyGroups = updatedGroups.filter((g) => g.tagIds.length === 0);
  for (const g of emptyGroups) {
    bin.push({
      id: g.id,
      kind: "group",
      name: g.name,
      data: { ...g } as unknown as Record<string, unknown>,
      deletedAt: now,
    });
  }
  writeDb("groups.json", updatedGroups.filter((g) => g.tagIds.length > 0));
  writeDb("bin.json", bin);

  return Response.json({ ok: true });
}
