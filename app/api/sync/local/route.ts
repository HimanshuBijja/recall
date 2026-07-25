import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";

const COLLECTIONS = ["cards", "tags", "sessions", "groups", "bin", "reviews", "settings", "subjects"];

export async function POST() {
  const sourceUri = process.env.MONGODB_URI;
  const targetUri =
    process.env.LOCAL_MONGODB_URI || "mongodb://127.0.0.1:27017/?retryWrites=false";
  const dbName = process.env.MONGODB_DB || "recall";

  if (!sourceUri) {
    return NextResponse.json(
      { error: "MONGODB_URI (Atlas source) is not set in environment" },
      { status: 500 }
    );
  }

  let srcClient: MongoClient | null = null;
  let dstClient: MongoClient | null = null;

  try {
    srcClient = new MongoClient(sourceUri, { serverSelectionTimeoutMS: 5000 });
    dstClient = new MongoClient(targetUri, { serverSelectionTimeoutMS: 5000 });

    // Establish connections in parallel
    await Promise.all([srcClient.connect(), dstClient.connect()]);

    const srcDb = srcClient.db(dbName);
    const dstDb = dstClient.db(dbName);

    const results: Record<string, number> = {};

    for (const name of COLLECTIONS) {
      const docs = await srcDb.collection(name).find({}).toArray();
      const targetColl = dstDb.collection(name);
      
      // Delete existing local data and replace with source data
      await targetColl.deleteMany({});
      if (docs.length > 0) {
        await targetColl.insertMany(docs);
      }
      results[name] = docs.length;
    }

    return NextResponse.json({ success: true, results });
  } catch (error: unknown) {
    console.error("Local database sync error:", error);
    const message = error instanceof Error ? error.message : "Failed to mirror database";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  } finally {
    if (srcClient) await srcClient.close();
    if (dstClient) await dstClient.close();
  }
}
