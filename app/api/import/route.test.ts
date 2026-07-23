import { beforeAll, afterAll, beforeEach, expect, test } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { readDb, writeDb, resetDbForTests } from "@/lib/db";
import { POST } from "./route";
import { NextRequest } from "next/server";
import type { Card } from "@/types";

let mongo: MongoMemoryReplSet;

beforeAll(async () => {
  await resetDbForTests();
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "recall_import_test";
});

afterAll(async () => {
  await resetDbForTests();
  await mongo.stop();
});

beforeEach(async () => {
  await writeDb("cards.json", []);
  await writeDb("tags.json", []);
  await writeDb("groups.json", []);
});

test("import route processes flash, cloze, and match cards", async () => {
  const payload = {
    cards: [
      {
        kind: "flash",
        question: "Flash Q",
        answer: "Flash A",
        difficulty: 3,
        tags: ["tag1"]
      },
      {
        kind: "cloze",
        clozeText: "This is a ==blank==.",
        difficulty: 1,
        tags: ["tag2"]
      },
      {
        kind: "match",
        question: "Match statements",
        pairs: [
          { left: "A", right: "1" },
          { left: "B", right: "2" }
        ],
        difficulty: 2,
        tags: ["tag1", "tag3"]
      }
    ],
    tags: [
      { name: "tag1", parents: [] },
      { name: "tag2", parents: ["tag1"] }
    ],
    groups: [
      { name: "Group 1", tags: ["tag1", "tag2"] }
    ]
  };

  const req = new NextRequest("http://localhost/api/import", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  const res = await POST(req);
  expect(res.status).toBe(201);

  const data = await res.json();
  expect(data.cards.inserted).toBe(3);
  expect(data.tags.inserted).toBe(2); // tag1, tag2 (tag3 created implicitly is not counted in explicit inserts count)

  const cards = await readDb<Card>("cards.json");
  expect(cards).toHaveLength(3);

  const flashCard = cards.find(c => c.kind === "flash");
  expect(flashCard).toBeDefined();
  expect(flashCard?.question).toBe("Flash Q");
  expect(flashCard?.answer).toBe("Flash A");

  const clozeCard = cards.find(c => c.kind === "cloze");
  expect(clozeCard).toBeDefined();
  expect(clozeCard?.clozeText).toBe("This is a ==blank==.");
  expect(clozeCard?.question).toBe("This is a ==blank==.");

  const matchCard = cards.find(c => c.kind === "match");
  expect(matchCard).toBeDefined();
  expect(matchCard?.pairs).toEqual([
    { left: "A", right: "1" },
    { left: "B", right: "2" }
  ]);
});
