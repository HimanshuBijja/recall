// Full one-shot copy: Atlas -> local mongod. Run on laptop startup to close
// the gap for anything that changed on Atlas while the laptop was off.
import { COLLECTIONS, requireEnv, connect, mirrorCollection } from "./mirror-lib.mjs";

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
} finally {
  await src.close();
  await dst.close();
}
