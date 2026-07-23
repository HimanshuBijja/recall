import { beforeAll, afterAll, beforeEach, expect, test } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { writeDb, resetDbForTests } from "@/lib/db";
import { GET as getDue } from "./route";
import { GET as getSummary } from "../summary/route";
import { NextRequest } from "next/server";
import type { Card, Review } from "@/types";

let mongo: MongoMemoryReplSet;

beforeAll(async () => {
  await resetDbForTests();
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "recall_reviews_api_test";
});

afterAll(async () => {
  await resetDbForTests();
  await mongo.stop();
});

beforeEach(async () => {
  await writeDb("cards.json", []);
  await writeDb("reviews.json", []);
});

test("GET /api/reviews/due returns lists of due and new cards", async () => {
  const card1: Card = {
    id: "card-due-1",
    kind: "mcq",
    question: "Test Q 1",
    answer: "A",
    distractors: [],
    explanation: "",
    hint: "",
    difficulty: 3,
    tags: [],
    createdAt: new Date().toISOString(),
  };
  const card2: Card = {
    id: "card-new-1",
    kind: "mcq",
    question: "Test Q 2",
    answer: "A",
    distractors: [],
    explanation: "",
    hint: "",
    difficulty: 3,
    tags: [],
    createdAt: new Date().toISOString(),
  };
  await writeDb("cards.json", [card1, card2]);

  const review: Review = {
    cardId: "card-due-1",
    dueAt: new Date(Date.now() - 60_000).toISOString(),
    lastReviewedAt: null,
    firstSeenAt: new Date().toISOString(),
    fsrs: { stability: 1, difficulty: 1, elapsed_days: 0, scheduled_days: 0, reps: 1, state: 1, last_review: null, due: "" },
  };
  await writeDb("reviews.json", [review]);

  const req = new NextRequest("http://localhost/api/reviews/due?newLimit=10");
  const res = await getDue(req);
  expect(res.status).toBe(200);

  const data = await res.json();
  expect(data.dueIds).toContain("card-due-1");
  expect(data.newIds).toContain("card-new-1");
});

test("GET /api/reviews/summary returns forecast array", async () => {
  const res = await getSummary();
  expect(res.status).toBe(200);

  const data = await res.json();
  expect(data).toHaveProperty("due");
  expect(data).toHaveProperty("overdue");
  expect(data).toHaveProperty("new");
  expect(data.forecast.length).toBe(14);
});
