import { MongoClient } from "mongodb";
import fs from "node:fs";
import path from "node:path";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");
const dbName = process.env.MONGODB_DB ?? "recall";

const DATA_DIR = path.join(process.cwd(), "data");
const FILES = ["cards.json", "tags.json", "sessions.json", "groups.json", "bin.json"];

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

for (const file of FILES) {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) continue;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    console.warn(`skip ${file}: invalid JSON`);
    continue;
  }
  if (!Array.isArray(parsed)) {
    console.warn(`skip ${file}: not an array`);
    continue;
  }
  const coll = db.collection(file.replace(/\.json$/, ""));
  await coll.deleteMany({});
  if (parsed.length > 0) await coll.insertMany(parsed);
  console.log(`seeded ${file}: ${parsed.length} docs`);
}

await client.close();
console.log("done");
