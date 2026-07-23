import { getDb, getClient, supportsTransactions } from "@/lib/mongodb";

export { resetDbForTests } from "@/lib/mongodb";

function collectionName(name: string): string {
  return name.replace(/\.json$/, "");
}

export async function readDb<T>(name: string): Promise<T[]> {
  const db = await getDb();
  const docs = await db
    .collection(collectionName(name))
    .find({}, { projection: { _id: 0 } })
    .toArray();
  return docs as T[];
}

export async function writeDb<T>(name: string, data: T[]): Promise<void> {
  const db = await getDb();
  const client = await getClient();
  const coll = db.collection(collectionName(name));
  const docs = data.map((d) => ({ ...d })) as Record<string, unknown>[];

  const canTransact = await supportsTransactions();

  if (!canTransact) {
    if (docs.length === 0) {
      await coll.deleteMany({});
      return;
    }
    // No transactions on standalone mongod, so swap in a fully-written
    // temp collection atomically instead of delete-then-insert, which
    // would leave the collection empty if the process crashes mid-write.
    const target = collectionName(name);
    const tmpName = `${target}__write_tmp`;
    const tmp = db.collection(tmpName);
    await tmp.drop().catch(() => {});
    await tmp.insertMany(docs);
    await db.renameCollection(tmpName, target, { dropTarget: true });
    return;
  }

  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await coll.deleteMany({}, { session });
      if (docs.length > 0) await coll.insertMany(docs, { session });
    });
  } finally {
    await session.endSession();
  }
}
