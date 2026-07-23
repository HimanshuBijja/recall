import { beforeAll, afterAll, beforeEach, expect, test } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { writeDb, resetDbForTests } from "@/lib/db";
import { GET } from "@/app/api/cards/route";
import type { Card } from "@/types";

let mongo: MongoMemoryReplSet;
beforeAll(async () => {
  await resetDbForTests();
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "recall_cards_test";
});
afterAll(async () => { await resetDbForTests(); await mongo.stop(); });
beforeEach(async () => { await writeDb("cards.json", []); });

function req(qs: string) {
  return { nextUrl: new URL(`http://localhost/api/cards${qs}`) } as never;
}

test("videoId filter returns marker rows only", async () => {
  const cards: Card[] = [
    { id: "1", kind: "mcq", question: "Q", answer: "A", distractors: ["b","c","d"], explanation: "", hint: "", difficulty: 3, tags: [], createdAt: "",
      source: { videoId: "abc", url: "u", timestamp: 10, marker: { shape: "circle", color: "#f59e0b" } } },
    { id: "2", kind: "flash", question: "Q2", answer: "A2", distractors: [], explanation: "", hint: "", difficulty: 3, tags: [], createdAt: "" },
  ];
  await writeDb("cards.json", cards);
  const res = await GET(req("?videoId=abc"));
  const rows = await res.json();
  expect(rows).toEqual([{ id: "1", kind: "mcq", timestamp: 10, marker: { shape: "circle", color: "#f59e0b" } }]);
});
