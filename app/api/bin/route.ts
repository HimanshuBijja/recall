import { readDb, writeDb } from "@/lib/db";
import type { BinItem } from "@/types";

const PURGE_DAYS = 30;

function purgeExpired(bin: BinItem[]): BinItem[] {
  const cutoff = Date.now() - PURGE_DAYS * 24 * 60 * 60 * 1000;
  return bin.filter((t) => new Date(t.deletedAt).getTime() > cutoff);
}

export async function GET() {
  const bin = purgeExpired(readDb<BinItem>("bin.json"));
  writeDb("bin.json", bin);
  return Response.json(bin);
}
