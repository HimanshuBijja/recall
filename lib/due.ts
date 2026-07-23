import type { Card, Review } from "@/types";
import { isDue } from "./srs";

export interface SelectDueOptions {
  newLimit?: number;
  exclude?: string[];
}

export function selectDue(
  cards: Card[],
  reviews: Review[],
  now: Date,
  options: SelectDueOptions = {}
): { dueIds: string[]; newIds: string[] } {
  const newLimit = options.newLimit ?? 20;
  const exclude = new Set(options.exclude ?? []);

  const activeCardIds = new Set(cards.map((c) => c.id));
  const reviewMap = new Map(reviews.map((r) => [r.cardId, r]));

  const dueIds = reviews
    .filter((r) => activeCardIds.has(r.cardId) && !exclude.has(r.cardId) && isDue(r, now))
    .map((r) => r.cardId);

  const newIds: string[] = [];
  for (const c of cards) {
    if (newIds.length >= newLimit) break;
    if (!reviewMap.has(c.id) && !exclude.has(c.id)) {
      newIds.push(c.id);
    }
  }

  return { dueIds, newIds };
}

export function getReviewsSummary(cards: Card[], reviews: Review[], now: Date) {
  const activeCardIds = new Set(cards.map((c) => c.id));
  const activeReviews = reviews.filter((r) => activeCardIds.has(r.cardId));

  const due = activeReviews.filter((r) => new Date(r.dueAt).getTime() <= now.getTime()).length;

  const overdue = activeReviews.filter(
    (r) => new Date(r.dueAt).getTime() <= now.getTime() && r.lastReviewedAt !== null
  ).length;

  const reviewedCardIds = new Set(reviews.map((r) => r.cardId));
  const newCount = cards.filter((c) => !reviewedCardIds.has(c.id)).length;

  const forecast: { date: string; count: number }[] = [];

  const getUtcDateString = (d: Date) => {
    return d.toISOString().split("T")[0];
  };

  for (let i = 0; i < 14; i++) {
    const targetDay = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const dayStr = getUtcDateString(targetDay);

    let count = 0;
    if (i === 0) {
      count = due;
    } else {
      count = activeReviews.filter((r) => {
        const rDateStr = r.dueAt.split("T")[0];
        return rDateStr === dayStr;
      }).length;
    }

    forecast.push({ date: dayStr, count });
  }

  return { due, overdue, new: newCount, forecast };
}
