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

test("import route normalizes alias shapes for cloze, tf-sort, and match", async () => {
  const payload = {
    cards: [
      {
        kind: "cloze",
        text: "The capital of France is ==Paris==.",
        difficulty: 2,
        tags: []
      },
      {
        kind: "tf-sort",
        question: "Sort these",
        statements: [
          { statement: "Go compiles to native code.", truth: true },
          { statement: "Go requires a VM to run.", truth: false }
        ],
        difficulty: 2,
        tags: []
      },
      {
        kind: "match",
        question: "Match them",
        pairs: [
          ["A", "1"],
          ["B", "2"]
        ],
        difficulty: 2,
        tags: []
      }
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

  const cards = await readDb<Card>("cards.json");

  const clozeCard = cards.find((c) => c.kind === "cloze");
  expect(clozeCard?.clozeText).toBe("The capital of France is ==Paris==.");

  const tfCard = cards.find((c) => c.kind === "tf-sort");
  expect(tfCard?.statements).toEqual([
    { text: "Go compiles to native code.", isTrue: true },
    { text: "Go requires a VM to run.", isTrue: false }
  ]);

  const matchCard = cards.find((c) => c.kind === "match" && c.question === "Match them");
  expect(matchCard?.pairs).toEqual([
    { left: "A", right: "1" },
    { left: "B", right: "2" }
  ]);
});

test("import preserves card.source (bundle round-trip)", async () => {
  const req = new NextRequest("http://localhost/api/import", {
    method: "POST",
    body: JSON.stringify({
      cards: [{
        kind: "flash", question: "Q", answer: "A", difficulty: 3, tags: [],
        source: { videoId: "vid1", url: "https://youtu.be/vid1", timestamp: 42,
          channel: "Chan", title: "Lesson", screenshotUrl: "https://r2/x.png",
          marker: { shape: "square", color: "#3b82f6" } },
      }],
    }),
  });
  const res = await POST(req);
  expect((await res.json()).cards.inserted).toBe(1);

  const cards = await readDb<Card>("cards.json");
  expect(cards[0].source).toEqual({
    videoId: "vid1", url: "https://youtu.be/vid1", timestamp: 42,
    channel: "Chan", title: "Lesson", screenshotUrl: "https://r2/x.png",
    marker: { shape: "square", color: "#3b82f6" },
  });
});
