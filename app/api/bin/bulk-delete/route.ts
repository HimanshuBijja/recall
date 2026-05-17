import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { BinItem } from "@/types";

export async function POST(req: NextRequest) {
  const { ids } = (await req.json()) as { ids: string[] };
  if (!ids || ids.length === 0) {
    return Response.json({ error: "ids required" }, { status: 400 });
  }
  const bin = readDb<BinItem>("bin.json");
  const next = bin.filter((item) => !ids.includes(item.id));
  const removed = bin.length - next.length;
  if (removed === 0) {
    return Response.json({ error: "none found" }, { status: 404 });
  }
  writeDb("bin.json", next);
  return Response.json({ deleted: removed });
}
