import { fsrs, generatorParameters, createEmptyCard, Rating, type FSRS, type Grade, type Card as FsrsCard } from "ts-fsrs";
import type { Review } from "@/types";

const defaultScheduler = fsrs(generatorParameters());

export function ratingFrom(correct: boolean, confidence: 1 | 2 | 3): Grade {
  if (!correct) return Rating.Again;
  return confidence === 1 ? Rating.Hard : confidence === 2 ? Rating.Good : Rating.Easy;
}

function serialize(c: FsrsCard): Review["fsrs"] {
  return {
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    due: c.due.toISOString(),
    last_review: c.last_review?.toISOString() ?? null,
  };
}

function deserialize(s: Review["fsrs"]): FsrsCard {
  return {
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    learning_steps: s.learning_steps ?? 0,
    reps: s.reps,
    lapses: s.lapses ?? 0,
    state: s.state,
    due: new Date(s.due),
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  } as FsrsCard;
}

export function newReview(cardId: string, now: Date): Review {
  const c = createEmptyCard(now);
  return {
    cardId,
    fsrs: serialize(c),
    dueAt: c.due.toISOString(),
    lastReviewedAt: null,
    firstSeenAt: now.toISOString(),
  };
}

export function applyReview(
  r: Review,
  correct: boolean,
  confidence: 1 | 2 | 3,
  now: Date,
  scheduler: FSRS = defaultScheduler
): Review {
  const card = deserialize(r.fsrs);
  const rating = ratingFrom(correct, confidence);
  const next = scheduler.next(card, now, rating).card;
  return {
    ...r,
    fsrs: serialize(next),
    dueAt: next.due.toISOString(),
    lastReviewedAt: now.toISOString(),
  };
}

export function isDue(r: Review, now: Date): boolean {
  return new Date(r.dueAt).getTime() <= now.getTime();
}
