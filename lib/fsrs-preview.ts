import { fsrs, createEmptyCard, Rating, State, Grades, type FSRSParameters, type Grade } from "ts-fsrs";

export type PreviewRating = "again" | "hard" | "good" | "easy";

const RATING: Record<PreviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const STATE_LABEL: Record<number, string> = {
  [State.New]: "New",
  [State.Learning]: "Learning",
  [State.Review]: "Review",
  [State.Relearning]: "Relearning",
};

export interface ProjectionStep {
  rep: number;
  intervalDays: number;
  dueAt: string;
  state: string;
}

const MS_PER_DAY = 86_400_000;

/**
 * Walk a card forward through a rating sequence, returning the interval (in
 * days) between each review and its scheduled due date. The last rating is
 * repeated if `reps` exceeds the sequence length.
 */
export function projectPath(
  params: FSRSParameters,
  ratings: PreviewRating[],
  reps: number,
  start: Date = new Date()
): ProjectionStep[] {
  const f = fsrs(params);
  let card = createEmptyCard(start);
  let now = start;
  const out: ProjectionStep[] = [];

  for (let i = 0; i < reps; i++) {
    const rating = ratings[Math.min(i, ratings.length - 1)] ?? "good";
    const next = f.next(card, now, RATING[rating]).card;
    const intervalDays = (next.due.getTime() - now.getTime()) / MS_PER_DAY;
    out.push({
      rep: i + 1,
      intervalDays,
      dueAt: next.due.toISOString(),
      state: STATE_LABEL[next.state] ?? String(next.state),
    });
    card = next;
    now = next.due;
  }
  return out;
}

export interface BranchStep {
  rating: PreviewRating;
  intervalDays: number;
  state: string;
}

const GRADE_TO_RATING: Record<Grade, PreviewRating> = {
  [Rating.Again]: "again",
  [Rating.Hard]: "hard",
  [Rating.Good]: "good",
  [Rating.Easy]: "easy",
};

/**
 * For a fresh card, the next interval each of the four ratings would produce —
 * shows the branching a first review offers.
 */
export function branchFromNew(params: FSRSParameters, start: Date = new Date()): BranchStep[] {
  const f = fsrs(params);
  const card = createEmptyCard(start);
  const preview = f.repeat(card, start);
  return Grades.map((g) => {
    const c = preview[g].card;
    return {
      rating: GRADE_TO_RATING[g],
      intervalDays: (c.due.getTime() - start.getTime()) / MS_PER_DAY,
      state: STATE_LABEL[c.state] ?? String(c.state),
    };
  });
}
