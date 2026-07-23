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
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await coll.deleteMany({}, { session });
      if (data.length > 0) {
        await coll.insertMany(data.map((d) => ({ ...d })) as Record<string, unknown>[], { session });
      }
    });
  } finally {
    await session.endSession();
  }
}
