import type { Card, Review } from "@/types";
import { isDue } from "./srs";

export interface SelectDueOptions {
  newLimit?: number;
  exclude?: string[];
  shuffle?: boolean;
}

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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

  let dueIds = reviews
    .filter((r) => activeCardIds.has(r.cardId) && !exclude.has(r.cardId) && isDue(r, now))
    .map((r) => r.cardId);

  let newCards = cards.filter((c) => !reviewMap.has(c.id) && !exclude.has(c.id));

  if (options.shuffle) {
    dueIds = shuffleArr(dueIds);
    newCards = shuffleArr(newCards);
  }

  const newIds: string[] = [];
  for (const c of newCards) {
    if (newIds.length >= newLimit) break;
    newIds.push(c.id);
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

  const localDayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  for (let i = 0; i < 14; i++) {
    // Increment by calendar day (not fixed 24h ms) so a local DST transition
    // can't repeat or skip a day and silently drop a review from the forecast.
    const targetDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dayStr = localDayKey(targetDay);

    // Bucket 0 ("today") also absorbs anything overdue from earlier days,
    // so it matches <= today's local day rather than an exact string match.
    const count = activeReviews.filter((r) => {
      const rDay = localDayKey(new Date(r.dueAt));
      return i === 0 ? rDay <= dayStr : rDay === dayStr;
    }).length;

    forecast.push({ date: dayStr, count });
  }

  return { due, overdue, new: newCount, forecast };
}
