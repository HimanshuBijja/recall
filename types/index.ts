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
