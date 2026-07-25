import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { Subject } from "@/types";

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = (await req.json()) as Partial<Subject>;
  const subjects = await readDb<Subject>("subjects.json");
  const idx = subjects.findIndex((s) => s.id === id);
  if (idx === -1) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  subjects[idx] = {
    ...subjects[idx],
    name: body.name?.trim() || subjects[idx].name,
    groupIds: Array.isArray(body.groupIds) ? body.groupIds : subjects[idx].groupIds,
    exempted: typeof body.exempted === "boolean" ? body.exempted : subjects[idx].exempted,
  };
  await writeDb("subjects.json", subjects);
  return Response.json(subjects[idx]);
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const subjects = await readDb<Subject>("subjects.json");
  const filtered = subjects.filter((s) => s.id !== id);
  if (subjects.length === filtered.length) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  await writeDb("subjects.json", filtered);
  return Response.json({ ok: true });
}
