import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { BinItem, Group } from "@/types";

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = (await req.json()) as Partial<Group>;
  const groups = readDb<Group>("groups.json");
  const idx = groups.findIndex((g) => g.id === id);
  if (idx === -1) return Response.json({ error: "not found" }, { status: 404 });
  groups[idx] = {
    ...groups[idx],
    name: body.name?.trim() || groups[idx].name,
    tagIds: Array.isArray(body.tagIds) ? body.tagIds : groups[idx].tagIds,
  };
  writeDb("groups.json", groups);
  return Response.json(groups[idx]);
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const groups = readDb<Group>("groups.json");
  const deleted = groups.find((g) => g.id === id);
  if (!deleted) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  // Soft-delete to bin
  const bin = readDb<BinItem>("bin.json");
  bin.push({
    id: deleted.id,
    kind: "group",
    name: deleted.name,
    data: { ...deleted } as unknown as Record<string, unknown>,
    deletedAt: new Date().toISOString(),
  });
  writeDb("bin.json", bin);

  writeDb("groups.json", groups.filter((g) => g.id !== id));
  return Response.json({ ok: true });
}
