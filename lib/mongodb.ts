import { MongoClient, type Db } from "mongodb";

// Cache across hot reloads (dev) and serverless invocations (prod).
const globalForMongo = globalThis as unknown as {
  _mongoClientPromise?: Promise<MongoClient>;
};

function clientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (!globalForMongo._mongoClientPromise) {
    globalForMongo._mongoClientPromise = new MongoClient(uri).connect();
  }
  return globalForMongo._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  const dbName = process.env.MONGODB_DB ?? "recall";
  return client.db(dbName);
}

export async function getClient(): Promise<MongoClient> {
  return clientPromise();
}

export function resetDbForTests(): void {
  globalForMongo._mongoClientPromise = undefined;
}
