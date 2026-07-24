export type Difficulty = 1 | 2 | 3 | 4 | 5;
export type Confidence = 1 | 2 | 3;

export type CardKind = "mcq" | "tf-sort" | "flash" | "cloze" | "match" | "multi";

export interface TfStatement {
  text: string;
  isTrue: boolean;
}

export interface MatchPair {
  left: string;
  right: string;
}

export type MarkerShape = "circle" | "square" | "triangle" | "diamond" | "star";

/** A card captured from a video frame (YouTube extension). */
export interface VideoSource {
  type?: "video";
  videoId: string;
  url: string;
  timestamp: number;
  channel?: string;
  title?: string;
  screenshotUrl?: string;
  marker?: { shape: MarkerShape; color: string };
}

/**
 * A card generated from selected text on an ordinary web page.
 * The video-only properties are declared as `?: undefined` so that existing
 * `card.source?.videoId` reads keep type-checking against the union.
 */
export interface WebSource {
  type: "web";
  url: string;
  title?: string;
  siteName?: string;
  /** First ~400 chars of the text the card was generated from. */
  excerpt?: string;
  capturedAt: string;
  videoId?: undefined;
  timestamp?: undefined;
  channel?: undefined;
  screenshotUrl?: undefined;
  marker?: undefined;
}

export type CardSource = VideoSource | WebSource;

/**
 * A flashcard. Kinds:
 * - "mcq": single correct answer + 3 distractors.
 * - "multi": multiple correct answers + distractors; scored all-or-nothing.
 * - "tf-sort": user sorts each `statements[]` entry into True/False.
 * - "flash": self-graded swipe card (question/answer).
 * - "cloze": fill in the blank ==clozeText==.
 * - "match": match left and right pairs.
 */
export interface Card {
  id: string;
  kind?: CardKind;
  question: string;
  answer: string;
  distractors: string[];
  /** `multi` only: the correct options (>=1). Wrong options live in `distractors`. */
  answers?: string[];
  statements?: TfStatement[];
  clozeText?: string;
  pairs?: MatchPair[];
  bookmarked?: boolean;
  explanation: string;
  hint: string;
  difficulty: Difficulty;
  tags: string[];
  createdAt: string;
  source?: CardSource;
}

export interface Tag {
  id: string;
  name: string;
  parents: string[];
}

export interface SessionResult {
  cardId: string;
  correct: boolean;
  timeTaken: number;
  confidence: Confidence;
}

export interface Session {
  id: string;
  tagIds: string[];
  results: SessionResult[];
  score: number;
  completedAt: string;
}

export interface TagStat {
  tagId: string;
  tagName: string;
  total: number;
  correct: number;
  accuracy: number;
}

/**
 * A saved collection of tag IDs — lets the user pre-define a study set
 * ("Exam revision", "JS quirks", "Yesterday's misses") and launch a test
 * on it from anywhere with one click.
 */
export interface Group {
  id: string;
  name: string;
  tagIds: string[];
  createdAt: string;
  videoId?: string;
  videoUrl?: string;
  exempted?: boolean;
}

export interface Subject {
  id: string;
  name: string;
  groupIds: string[];
  createdAt: string;
  exempted?: boolean;
}

/**
 * A soft-deleted item sitting in the bin. `kind` discriminates what was
 * deleted; `data` holds the original object verbatim. Auto-purged 30
 * days after `deletedAt`.
 */
export type BinItemKind = "tag" | "card" | "group";

export interface BinItem {
  id: string;
  kind: BinItemKind;
  name: string;
  data: Record<string, unknown>;
  deletedAt: string;
}

export interface FsrsState {
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
  due: string;
}

export interface FsrsSettings {
  request_retention: number;
  maximum_interval: number;
  learning_steps: string[];
  relearning_steps: string[];
  enable_fuzz: boolean;
  enable_short_term: boolean;
}

export interface Review {
  cardId: string;
  fsrs: FsrsState;
  dueAt: string;
  lastReviewedAt: string | null;
  firstSeenAt: string;
}
