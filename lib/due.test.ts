import { expect, test } from "vitest";
import { selectDue, getReviewsSummary } from "./due";
import type { Card, Review } from "@/types";

const mockCards: Card[] = [
  { id: "c1", question: "Q1", answer: "A", distractors: [], explanation: "", hint: "", difficulty: 3, tags: [], createdAt: "" },
  { id: "c2", question: "Q2", answer: "A", distractors: [], explanation: "", hint: "", difficulty: 3, tags: [], createdAt: "" },
  { id: "c3", question: "Q3", answer: "A", distractors: [], explanation: "", hint: "", difficulty: 3, tags: [], createdAt: "" },
];

test("selectDue returns correct due and new cards", () => {
  const now = new Date("2026-01-01T12:00:00Z");

  // c1 has an overdue review
  // c2 has a future review (not due)
  // c3 has no review (new)
  const reviews: Review[] = [
    {
      cardId: "c1",
      dueAt: new Date(now.getTime() - 1000).toISOString(),
      lastReviewedAt: null,
      firstSeenAt: "",
      fsrs: { stability: 1, difficulty: 1, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, lapses: 0, reps: 1, state: 1, last_review: null, due: "" },
    },
    {
      cardId: "c2",
      dueAt: new Date(now.getTime() + 10_000).toISOString(),
      lastReviewedAt: null,
      firstSeenAt: "",
      fsrs: { stability: 1, difficulty: 1, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, lapses: 0, reps: 1, state: 1, last_review: null, due: "" },
    },
  ];

  const result = selectDue(mockCards, reviews, now, { newLimit: 1 });
  expect(result.dueIds).toEqual(["c1"]);
  expect(result.newIds).toEqual(["c3"]);

  // Test exclude option
  const excludedResult = selectDue(mockCards, reviews, now, { exclude: ["c3"] });
  expect(excludedResult.newIds).toEqual([]);
});

test("selectDue shuffles when shuffle option is true", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const manyCards: Card[] = Array.from({ length: 50 }, (_, i) => ({
    id: `c${i}`,
    question: `Q${i}`,
    answer: "A",
    distractors: [],
    explanation: "",
    hint: "",
    difficulty: 3,
    tags: [],
    createdAt: "",
  }));

  // No reviews, all are new cards
  const resultUnshuffled = selectDue(manyCards, [], now, { newLimit: 50, shuffle: false });
  const resultShuffled = selectDue(manyCards, [], now, { newLimit: 50, shuffle: true });

  expect(resultUnshuffled.newIds).toEqual(manyCards.map((c) => c.id));
  expect(resultShuffled.newIds.length).toBe(50);
  // It is statistically guaranteed to have a different order with 50 elements
  expect(resultShuffled.newIds).not.toEqual(resultUnshuffled.newIds);
  // But they should contain all the same elements
  expect(new Set(resultShuffled.newIds)).toEqual(new Set(resultUnshuffled.newIds));
});

test("getReviewsSummary reports correct counts and forecast shape", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const reviews: Review[] = [
    {
      cardId: "c1",
      dueAt: new Date(now.getTime() - 1000).toISOString(),
      lastReviewedAt: new Date().toISOString(),
      firstSeenAt: "",
      fsrs: { stability: 1, difficulty: 1, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, lapses: 0, reps: 1, state: 1, last_review: null, due: "" },
    },
  ];

  const summary = getReviewsSummary(mockCards, reviews, now);
  expect(summary.due).toBe(1);
  expect(summary.overdue).toBe(1);
  expect(summary.new).toBe(2);
  expect(summary.forecast.length).toBe(14);
  expect(summary.forecast[0].count).toBe(1);
});

test("forecast buckets a due-today review once, by local day", () => {
  const now = new Date("2026-03-10T20:00:00"); // local
  const cards: Card[] = [{ id: "c1", kind: "flash", question: "Q", answer: "A", distractors: [], explanation: "", hint: "", difficulty: 3, tags: [], createdAt: "" }];
  const reviews: Review[] = [{ cardId: "c1", dueAt: new Date("2026-03-10T23:00:00").toISOString(), lastReviewedAt: null, firstSeenAt: "",
    fsrs: { stability: 1, difficulty: 1, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 1, lapses: 0, state: 1, last_review: null, due: "" } }];
  const s = getReviewsSummary(cards, reviews, now);
  expect(s.forecast[0].count).toBe(1);   // today
  expect(s.forecast[1].count).toBe(0);   // tomorrow, not double-counted
});
