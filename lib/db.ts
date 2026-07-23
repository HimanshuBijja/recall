import { getDb, getClient } from "@/lib/mongodb";

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

  // Transactions require a replica set (Atlas) or mongos; a standalone
  // local mongod rejects them. Detect support and fall back to a
  // non-atomic replace so the same code runs against either deployment.
  const hello = await client.db("admin").command({ hello: 1 });
  const canTransact = Boolean(hello.setName) || hello.msg === "isdbgrid";

  if (!canTransact) {
    await coll.deleteMany({});
    if (docs.length > 0) await coll.insertMany(docs);
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
