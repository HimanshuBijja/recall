import { beforeAll, afterAll, beforeEach, expect, test } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { readDb, writeDb, resetDbForTests } from "@/lib/db";
import { updateReviewsForResults } from "./reviews";
import type { Review, SessionResult } from "@/types";

let mongo: MongoMemoryReplSet;

beforeAll(async () => {
  await resetDbForTests();
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "recall_reviews_test";
});

afterAll(async () => {
  await resetDbForTests();
  await mongo.stop();
});

beforeEach(async () => {
  await writeDb("reviews.json", []);
});

test("updateReviewsForResults creates and advances reviews", async () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const results: SessionResult[] = [
    { cardId: "card-abc", correct: true, timeTaken: 1000, confidence: 3 },
  ];

  await updateReviewsForResults(results, now);

  const reviews1 = await readDb<Review>("reviews.json");
  expect(reviews1.length).toBe(1);
  expect(reviews1[0].cardId).toBe("card-abc");
  expect(reviews1[0].lastReviewedAt).toBe(now.toISOString());
  const firstDue = new Date(reviews1[0].dueAt);
  expect(firstDue.getTime()).toBeGreaterThan(now.getTime());

  // Second review further advances it
  const later = new Date(firstDue.getTime() + 10_000);
  const secondResults: SessionResult[] = [
    { cardId: "card-abc", correct: true, timeTaken: 1000, confidence: 3 },
  ];

  await updateReviewsForResults(secondResults, later);

  const reviews2 = await readDb<Review>("reviews.json");
  expect(reviews2.length).toBe(1);
  expect(new Date(reviews2[0].dueAt).getTime()).toBeGreaterThan(firstDue.getTime());
});
