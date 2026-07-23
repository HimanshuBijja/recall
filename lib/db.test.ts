import { beforeAll, afterAll, beforeEach, expect, test } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { readDb, writeDb, resetDbForTests } from "@/lib/db";

let mongo: MongoMemoryReplSet;

beforeAll(async () => {
  await resetDbForTests();
  // Replica set so transactions (used by writeDb) work.
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "recall_test";
});

afterAll(async () => {
  await resetDbForTests();
  await mongo.stop();
});

beforeEach(async () => {
  await writeDb("cards.json", []);
  await writeDb("tags.json", []);
});

test("readDb returns [] for an empty collection", async () => {
  expect(await readDb("cards.json")).toEqual([]);
});

test("writeDb then readDb round-trips without leaking _id", async () => {
  const cards = [{ id: "a", question: "Q1" }, { id: "b", question: "Q2" }];
  await writeDb("cards.json", cards);
  const read = await readDb<{ id: string; question: string }>("cards.json");
  expect(read).toEqual(cards);
  expect(read.some((c) => "_id" in c)).toBe(false);
});

test("writeDb overwrites the whole collection", async () => {
  await writeDb("tags.json", [{ id: "1" }, { id: "2" }]);
  await writeDb("tags.json", [{ id: "9" }]);
  expect(await readDb("tags.json")).toEqual([{ id: "9" }]);
});
