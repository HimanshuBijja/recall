// Live one-way mirror: tail Atlas change streams and apply each change to the
// local mongod in near-real-time. Atlas is a replica set, so DB-level change
// streams are available. The local target is only ever written here.
import { requireEnv, connect } from "./mirror-lib.mjs";

const { source, target, dbName } = requireEnv();

const src = await connect(source);
const dst = await connect(target);
const srcDb = src.db(dbName);
const dstDb = dst.db(dbName);

let stream;

async function shutdown() {
  try {
    await stream?.close();
  } catch {}
  await src.close().catch(() => {});
  await dst.close().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function apply(change) {
  const coll = change.ns?.coll;
  if (!coll) return;
  const local = dstDb.collection(coll);
  switch (change.operationType) {
    case "insert":
    case "update":
    case "replace": {
      const doc = change.fullDocument;
      if (doc && doc._id != null) {
        await local.replaceOne({ _id: doc._id }, doc, { upsert: true });
      }
      break;
    }
    case "delete": {
      if (change.documentKey?._id != null) {
        await local.deleteOne({ _id: change.documentKey._id });
      }
      break;
    }
    case "drop": {
      await local.deleteMany({});
      break;
    }
    default:
      break;
  }
}

console.log(`watching Atlas db "${dbName}" -> mirroring to local...`);
// updateLookup gives the full document on updates so we can replace locally.
stream = srcDb.watch([], { fullDocument: "updateLookup" });
stream.on("change", (change) => {
  apply(change).catch((err) => console.error("apply error:", err.message));
});
stream.on("error", async (err) => {
  console.error("change stream error, exiting for restart:", err.message);
  await shutdown();
});
