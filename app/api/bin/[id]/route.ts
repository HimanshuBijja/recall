import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { BinItem } from "@/types";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const bin = readDb<BinItem>("bin.json");
  const next = bin.filter((item) => item.id !== id);
  if (next.length === bin.length) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  writeDb("bin.json", next);
  return Response.json({ ok: true });
}
