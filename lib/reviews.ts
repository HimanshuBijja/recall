import { readDb, writeDb } from "@/lib/db";
import type { Review, SessionResult } from "@/types";
import { newReview, applyReview } from "./srs";

export async function updateReviewsForResults(results: SessionResult[], now: Date): Promise<void> {
  const reviews = await readDb<Review>("reviews.json");
  const reviewMap = new Map(reviews.map((r) => [r.cardId, r]));

  for (const res of results) {
    let rev = reviewMap.get(res.cardId);
    if (!rev) {
      rev = newReview(res.cardId, now);
    }
    const updated = applyReview(rev, res.correct, res.confidence, now);
    reviewMap.set(res.cardId, updated);
  }

  await writeDb("reviews.json", Array.from(reviewMap.values()));
}
