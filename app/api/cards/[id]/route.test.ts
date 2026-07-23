import { beforeAll, afterAll, beforeEach, expect, test } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { readDb, writeDb, resetDbForTests } from "@/lib/db";
import { PATCH } from "./route";
import { NextRequest } from "next/server";
import type { Card } from "@/types";

let mongo: MongoMemoryReplSet;

beforeAll(async () => {
  await resetDbForTests();
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "recall_card_id_test";
});

afterAll(async () => {
  await resetDbForTests();
  await mongo.stop();
});

beforeEach(async () => {
  await writeDb("cards.json", []);
});

test("PATCH updates bookmarked state", async () => {
  const card: Card = {
    id: "card-123",
    kind: "mcq",
    question: "Test Q",
    answer: "Test A",
    distractors: ["B", "C", "D"],
    explanation: "",
    hint: "",
    difficulty: 3,
    tags: [],
    createdAt: new Date().toISOString(),
    bookmarked: false,
  };
  await writeDb("cards.json", [card]);

  const req = new NextRequest("http://localhost/api/cards/card-123", {
    method: "PATCH",
    body: JSON.stringify({ bookmarked: true }),
  });

  const res = await PATCH(req, { params: Promise.resolve({ id: "card-123" }) });
  expect(res.status).toBe(200);

  const updatedCard = await res.json();
  expect(updatedCard.bookmarked).toBe(true);

  const dbCards = await readDb<Card>("cards.json");
  expect(dbCards[0].bookmarked).toBe(true);
});
