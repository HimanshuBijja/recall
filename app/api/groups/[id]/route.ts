import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { Group } from "@/types";

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
  const next = groups.filter((g) => g.id !== id);
  if (next.length === groups.length) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  writeDb("groups.json", next);
  return Response.json({ ok: true });
}
