import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { BinItem, Card, Group, Tag } from "@/types";

import { buildCardFromInput } from "../validate";

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = await req.json();
  const cards = await readDb<Card>("cards.json");
  const idx = cards.findIndex((c) => c.id === id);
  if (idx === -1) return Response.json({ error: "not found" }, { status: 404 });

  const mergedPayload = {
    ...cards[idx],
    ...body,
  };

  const { card: parsedCard, error } = buildCardFromInput(mergedPayload);
  if (error) {
    return Response.json({ error }, { status: 400 });
  }
 
  const tags = await readDb<Tag>("tags.json");
  const tagByName = new Map(tags.map((t) => [t.name.toLowerCase(), t.id]));
  const tagIdsSet = new Set(tags.map((t) => t.id));
  const resolvedTagIds: string[] = [];
  let tagsChanged = false;
 
  for (const tInput of parsedCard!.tags) {
    const trimmed = tInput.trim();
    if (!trimmed) continue;
    if (tagIdsSet.has(trimmed)) {
      resolvedTagIds.push(trimmed);
      continue;
    }
    const lowerName = trimmed.toLowerCase();
    const existingId = tagByName.get(lowerName);
    if (existingId) {
      resolvedTagIds.push(existingId);
    } else {
      const newTag: Tag = {
        id: crypto.randomUUID(),
        name: trimmed,
        parents: [],
      };
      tags.push(newTag);
      tagByName.set(lowerName, newTag.id);
      tagIdsSet.add(newTag.id);
      resolvedTagIds.push(newTag.id);
      tagsChanged = true;
    }
  }
 
  if (tagsChanged) {
    await writeDb("tags.json", tags);
  }

  const merged: Card = {
    ...parsedCard!,
    tags: resolvedTagIds,
    id: cards[idx].id,
    createdAt: cards[idx].createdAt,
  };
 
  cards[idx] = merged;
  await writeDb("cards.json", cards);
  return Response.json(cards[idx]);
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const cards = await readDb<Card>("cards.json");
  const deleted = cards.find((c) => c.id === id);
  if (!deleted) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const bin = await readDb<BinItem>("bin.json");
  const now = new Date().toISOString();

  // Soft-delete card to bin
  bin.push({
    id: deleted.id,
    kind: "card",
    name: deleted.question.slice(0, 80),
    data: { ...deleted } as unknown as Record<string, unknown>,
    deletedAt: now,
  });

  const remaining = cards.filter((c) => c.id !== id);
  await writeDb("cards.json", remaining);

  // Auto-delete orphan tags: if any tag from the deleted card now has
  // zero cards referencing it, soft-delete that tag too.
  const orphanTagIds = deleted.tags.filter(
    (tid) => !remaining.some((c) => c.tags.includes(tid))
  );

  if (orphanTagIds.length > 0) {
    const tags = await readDb<Tag>("tags.json");
    const orphanTags = tags.filter((t) => orphanTagIds.includes(t.id));

    for (const t of orphanTags) {
      bin.push({
        id: t.id,
        kind: "tag",
        name: t.name,
        data: { ...t },
        deletedAt: now,
      });
    }

    const survivingTags = tags
      .filter((t) => !orphanTagIds.includes(t.id))
      .map((t) => ({
        ...t,
        parents: t.parents.filter((p) => !orphanTagIds.includes(p)),
      }));
    await writeDb("tags.json", survivingTags);

    // Strip orphaned tags from groups; auto-delete groups left with zero tags.
    const groups = await readDb<Group>("groups.json");
    const updatedGroups = groups.map((g) => ({
      ...g,
      tagIds: g.tagIds.filter((tid) => !orphanTagIds.includes(tid)),
    }));
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
    await writeDb("groups.json", updatedGroups.filter((g) => g.tagIds.length > 0));
  }

  await writeDb("bin.json", bin);
  return Response.json({ ok: true, orphanedTags: orphanTagIds.length });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = await req.json();
  const cards = await readDb<Card>("cards.json");
  const idx = cards.findIndex((c) => c.id === id);
  if (idx === -1) return Response.json({ error: "not found" }, { status: 404 });

  if (typeof body.bookmarked === "boolean") {
    cards[idx].bookmarked = body.bookmarked;
    await writeDb("cards.json", cards);
  }

  return Response.json(cards[idx]);
}
