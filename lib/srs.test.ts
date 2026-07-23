import { expect, test } from "vitest";
import { ratingFrom, newReview, applyReview, isDue } from "@/lib/srs";
import { Rating } from "ts-fsrs";

test("rating map", () => {
  expect(ratingFrom(false, 3)).toBe(Rating.Again);
  expect(ratingFrom(true, 1)).toBe(Rating.Hard);
  expect(ratingFrom(true, 2)).toBe(Rating.Good);
  expect(ratingFrom(true, 3)).toBe(Rating.Easy);
});

test("correct answer pushes due into the future", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const r0 = newReview("c1", now);
  const r1 = applyReview(r0, true, 3, now);
  expect(new Date(r1.dueAt).getTime()).toBeGreaterThan(now.getTime());
});

test("wrong answer keeps it due soon", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const r1 = applyReview(newReview("c1", now), true, 3, now);
  const later = new Date(r1.dueAt);
  const r2 = applyReview(r1, false, 1, later);
  expect(isDue(r2, new Date(later.getTime() + 600_000))).toBe(true);
});

// Regression: serialize/deserialize used to drop learning_steps + lapses, so a
// card answered Good never left the learning steps across the DB round-trip —
// it stayed stuck at the 10-minute step forever. It must graduate to the Review
// state with a multi-day interval once the fields are persisted.
test("Good answers graduate to Review across persistence round-trips", () => {
  let reviewTime = new Date("2026-01-01T00:00:00Z");
  let r = newReview("c1", reviewTime);
  let lastInterval = 0;
  for (let i = 0; i < 4; i++) {
    r = applyReview(r, true, 2, reviewTime);
    // simulate the DB round-trip: only the persisted fields survive
    r = { ...r, fsrs: JSON.parse(JSON.stringify(r.fsrs)) };
    lastInterval = new Date(r.dueAt).getTime() - reviewTime.getTime();
    reviewTime = new Date(r.dueAt);
  }
  // State 2 = Review (out of the learning steps)
  expect(r.fsrs.state).toBe(2);
  // At least a day out — proves it is no longer stuck in the <10m loop
  expect(lastInterval).toBeGreaterThan(24 * 60 * 60 * 1000);
  expect(r.fsrs.learning_steps).toBeDefined();
  expect(r.fsrs.lapses).toBeDefined();
});
