import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { BinItem, Card, Group, Tag } from "@/types";

export async function POST(req: NextRequest) {
  const { ids } = (await req.json()) as { ids: string[] };
  if (!ids || ids.length === 0) {
    return Response.json({ error: "ids required" }, { status: 400 });
  }

  const bin = readDb<BinItem>("bin.json");
  const toRestore = bin.filter((item) => ids.includes(item.id));

  if (toRestore.length === 0) {
    return Response.json({ error: "none found in bin" }, { status: 404 });
  }

  // Restore each item to its original file
  const tags = readDb<Tag>("tags.json");
  const cards = readDb<Card>("cards.json");
  const groups = readDb<Group>("groups.json");

  for (const item of toRestore) {
    const d = item.data as Record<string, unknown>;
    switch (item.kind) {
      case "tag":
        tags.push({ id: d.id as string, name: d.name as string, parents: (d.parents as string[]) ?? [] });
        break;
      case "card":
        cards.push(d as unknown as Card);
        break;
      case "group":
        groups.push(d as unknown as Group);
        break;
    }
  }

  writeDb("bin.json", bin.filter((item) => !ids.includes(item.id)));
  writeDb("tags.json", tags);
  writeDb("cards.json", cards);
  writeDb("groups.json", groups);

  return Response.json({ restored: toRestore.length });
}
