import { readDb, writeDb } from "@/lib/db";
import type { BinItem } from "@/types";
import { BinManager } from "./BinManager";

export const dynamic = "force-dynamic";

const PURGE_DAYS = 30;

export default async function BinPage() {
  const bin = await readDb<BinItem>("bin.json");
  // eslint-disable-next-line react-hooks/purity -- request-time cutoff in an async server component; runs once per request
  const cutoff = Date.now() - PURGE_DAYS * 24 * 60 * 60 * 1000;
  const active = bin.filter((t) => new Date(t.deletedAt).getTime() > cutoff);

  // Write back if any were purged
  if (active.length !== bin.length) {
    await writeDb("bin.json", active);
  }

  return <BinManager initialItems={active} />;
}
