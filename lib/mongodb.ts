import { MongoClient, type Db } from "mongodb";

// Cache across hot reloads (dev) and serverless invocations (prod).
const globalForMongo = globalThis as unknown as {
  _mongoClientPromise?: Promise<MongoClient>;
  _supportsTxn?: Promise<boolean>;
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

// Transactions require a replica set (Atlas) or mongos; a standalone local
// mongod rejects them. Topology doesn't change at runtime, so cache the
// result instead of running `hello` on every write.
export async function supportsTransactions(): Promise<boolean> {
  if (!globalForMongo._supportsTxn) {
    globalForMongo._supportsTxn = (async () => {
      const client = await clientPromise();
      const hello = await client.db("admin").command({ hello: 1 });
      return Boolean(hello.setName) || hello.msg === "isdbgrid";
    })();
  }
  return globalForMongo._supportsTxn;
}

export async function resetDbForTests(): Promise<void> {
  try {
    await (await globalForMongo._mongoClientPromise)?.close();
  } catch {
    // ignore — connection may already be closed or never established
  }
  globalForMongo._mongoClientPromise = undefined;
  globalForMongo._supportsTxn = undefined;
}
