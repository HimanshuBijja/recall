// Full one-shot copy: Atlas -> local mongod. Run on laptop startup to close
// the gap for anything that changed on Atlas while the laptop was off.
import { COLLECTIONS, requireEnv, connect, mirrorCollection } from "./mirror-lib.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMESTAMP_FILE = path.join(__dirname, ".last-sync-timestamp");
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds

let shouldSync = true;
if (fs.existsSync(TIMESTAMP_FILE)) {
  try {
    const content = fs.readFileSync(TIMESTAMP_FILE, "utf8").trim();
    const lastSync = parseInt(content, 10);
    if (!isNaN(lastSync) && Date.now() - lastSync < THREE_DAYS_MS) {
      shouldSync = false;
    }
  } catch (err) {
    console.warn(`[sync] failed to read timestamp, running sync: ${err.message}`);
  }
}

if (!shouldSync) {
  console.log("[sync] Last sync was less than 3 days ago. Skipping sync to boot instantly.");
  process.exit(0);
}

const { source, target, dbName } = requireEnv();

const src = await connect(source);
const dst = await connect(target);
try {
  const srcDb = src.db(dbName);
  const dstDb = dst.db(dbName);
  for (const name of COLLECTIONS) {
    const n = await mirrorCollection(srcDb, dstDb, name);
    console.log(`mirrored ${name}: ${n} docs`);
  }
  console.log("pull complete (Atlas -> local)");
  
  // Save current timestamp upon successful sync
  fs.writeFileSync(TIMESTAMP_FILE, String(Date.now()), "utf8");
} finally {
  await src.close();
  await dst.close();
}
