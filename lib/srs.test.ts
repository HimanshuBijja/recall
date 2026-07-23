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
