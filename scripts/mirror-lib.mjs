// Shared helpers for the Atlas -> local one-way mirror.
// Source of truth is Atlas (MONGODB_URI); local mongod (LOCAL_MONGODB_URI) is
// a read-only mirror. Never write app data to local directly — it gets
// overwritten by the mirror.
import { MongoClient } from "mongodb";

export const COLLECTIONS = ["cards", "tags", "sessions", "groups", "bin"];

export function requireEnv() {
  const source = process.env.MONGODB_URI;
  const target =
    process.env.LOCAL_MONGODB_URI ?? "mongodb://127.0.0.1:27017/?retryWrites=false";
  const dbName = process.env.MONGODB_DB ?? "recall";
  if (!source) throw new Error("MONGODB_URI (Atlas source) is not set");
  return { source, target, dbName };
}

export async function connect(uri) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  return client;
}

// Replace one local collection's contents with the source's.
export async function mirrorCollection(sourceDb, targetDb, name) {
  const docs = await sourceDb.collection(name).find({}).toArray();
  const target = targetDb.collection(name);
  await target.deleteMany({});
  if (docs.length > 0) await target.insertMany(docs);
  return docs.length;
}
