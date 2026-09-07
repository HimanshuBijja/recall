import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { BinItem } from "@/types";
import type { NoteBook } from "@/types/notes";

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = (await req.json()) as Partial<NoteBook>;
  const notebooks = await readDb<NoteBook>("notes.json");
  const idx = notebooks.findIndex((n) => n.id === id);

  if (idx === -1) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const updated: NoteBook = {
    ...notebooks[idx],
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : notebooks[idx].name,
    description: body.description !== undefined ? body.description.trim() : notebooks[idx].description,
    groupIds: Array.isArray(body.groupIds) ? body.groupIds.map(String) : notebooks[idx].groupIds,
  };

  notebooks[idx] = updated;
  await writeDb("notes.json", notebooks);

  return Response.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const notebooks = await readDb<NoteBook>("notes.json");
  const deleted = notebooks.find((n) => n.id === id);

  if (!deleted) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  // Soft-delete to bin
  const bin = await readDb<BinItem>("bin.json");
  bin.push({
    id: deleted.id,
    kind: "group", // store in bin
    name: deleted.name,
    data: { ...deleted } as unknown as Record<string, unknown>,
    deletedAt: new Date().toISOString(),
  });

  const remaining = notebooks.filter((n) => n.id !== id);
  await writeDb("notes.json", remaining);
  await writeDb("bin.json", bin);

  return Response.json({ ok: true });
}
