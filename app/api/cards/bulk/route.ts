import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { BinItem, Card, Group, Tag } from "@/types";

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

  const cards = await readDb<Card>("cards.json");
  const tags = await readDb<Tag>("tags.json");
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

  await writeDb("tags.json", tags);
  await writeDb("cards.json", cards);
  return Response.json({ inserted: created.length, cards: created }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const { ids } = body as { ids: string[] };
  if (!Array.isArray(ids)) {
    return Response.json({ error: "expected an array of ids" }, { status: 400 });
  }

  const cards = await readDb<Card>("cards.json");
  const bin = await readDb<BinItem>("bin.json");
  const now = new Date().toISOString();

  const toDelete = cards.filter((c) => ids.includes(c.id));
  if (toDelete.length === 0) {
    return Response.json({ ok: true, deleted: 0 });
  }

  // Soft-delete matching cards to the recycle bin
  for (const deleted of toDelete) {
    bin.push({
      id: deleted.id,
      kind: "card",
      name: deleted.question.slice(0, 80),
      data: { ...deleted } as unknown as Record<string, unknown>,
      deletedAt: now,
    });
  }

  const remaining = cards.filter((c) => !ids.includes(c.id));
  await writeDb("cards.json", remaining);

  // Auto-delete orphan tags: if any tag from deleted cards has no cards left referencing it, bin it too.
  const deletedTagIds = Array.from(new Set(toDelete.flatMap((c) => c.tags)));
  const orphanTagIds = deletedTagIds.filter(
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
    const emptyGroups = updatedGroups.filter(
      (g) => g.tagIds.length === 0 && !g.videoId && !g.webUrl
    );
    for (const g of emptyGroups) {
      bin.push({
        id: g.id,
        kind: "group",
        name: g.name,
        data: { ...g } as unknown as Record<string, unknown>,
        deletedAt: now,
      });
    }
    await writeDb(
      "groups.json",
      updatedGroups.filter((g) => g.tagIds.length > 0 || !!g.videoId || !!g.webUrl)
    );
  }

  await writeDb("bin.json", bin);
  return Response.json({ ok: true, deleted: toDelete.length, orphanedTags: orphanTagIds.length });
}
