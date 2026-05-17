import { readDb, writeDb } from "@/lib/db";
import type { BinItem } from "@/types";
import { BinManager } from "./BinManager";

export const dynamic = "force-dynamic";

const PURGE_DAYS = 30;

export default function BinPage() {
  const bin = readDb<BinItem>("bin.json");
  const cutoff = Date.now() - PURGE_DAYS * 24 * 60 * 60 * 1000;
  const active = bin.filter((t) => new Date(t.deletedAt).getTime() > cutoff);

  // Write back if any were purged
  if (active.length !== bin.length) {
    writeDb("bin.json", active);
  }

  return <BinManager initialItems={active} />;
}
