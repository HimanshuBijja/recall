export type Difficulty = 1 | 2 | 3 | 4 | 5;
export type Confidence = 1 | 2 | 3;

export interface Card {
  id: string;
  question: string;
  answer: string;
  distractors: string[];
  explanation: string;
  hint: string;
  difficulty: Difficulty;
  tags: string[];
  createdAt: string;
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
