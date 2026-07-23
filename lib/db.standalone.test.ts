import { beforeAll, afterAll, beforeEach, expect, test } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { readDb, writeDb, resetDbForTests } from "@/lib/db";

// A standalone mongod (no replica set) rejects transactions. This mirrors a
// local dev server and verifies writeDb's non-transactional fallback path.
let mongo: MongoMemoryServer;

beforeAll(async () => {
  await resetDbForTests();
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "recall_standalone_test";
  await resetDbForTests();
});

afterAll(async () => {
  await resetDbForTests();
  await mongo.stop();
});

beforeEach(async () => {
  await writeDb("cards.json", []);
});

test("writeDb works on a standalone server (no transactions)", async () => {
  const cards = [{ id: "a", question: "Q1" }, { id: "b", question: "Q2" }];
  await writeDb("cards.json", cards);
  const read = await readDb<{ id: string; question: string }>("cards.json");
  expect(read).toEqual(cards);
  expect(read.some((c) => "_id" in c)).toBe(false);
});

test("writeDb overwrites the whole collection on standalone", async () => {
  await writeDb("cards.json", [{ id: "1" }, { id: "2" }]);
  await writeDb("cards.json", [{ id: "9" }]);
  expect(await readDb("cards.json")).toEqual([{ id: "9" }]);
});
