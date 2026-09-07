import type { Card, Tag } from "@/types";

/**
 * Checks if a card matches the given search query string across all fields.
 */
export function matchesCardQuery(
  card: Card,
  query: string,
  tagById?: Map<string, Tag>
): boolean {
  if (!query || !query.trim()) return true;
  const q = query.trim().toLowerCase();

  // Question / Topic
  if (card.question && card.question.toLowerCase().includes(q)) return true;

  // Answer / Notes
  if (card.answer && card.answer.toLowerCase().includes(q)) return true;

  // Cloze Text
  if (card.clozeText && card.clozeText.toLowerCase().includes(q)) return true;

  // Explanation & Hint
  if (card.explanation && card.explanation.toLowerCase().includes(q)) return true;
  if (card.hint && card.hint.toLowerCase().includes(q)) return true;

  // Distractors
  if (card.distractors && card.distractors.some((d) => d.toLowerCase().includes(q))) return true;

  // True / False Statements
  if (card.statements && card.statements.some((s) => s.text.toLowerCase().includes(q))) return true;

  // Match Pairs
  if (
    card.pairs &&
    card.pairs.some((p) => p.left.toLowerCase().includes(q) || p.right.toLowerCase().includes(q))
  ) {
    return true;
  }

  // Tags
  if (card.tags && tagById) {
    for (const tid of card.tags) {
      const tag = tagById.get(tid);
      if (tag && tag.name.toLowerCase().includes(q)) return true;
    }
  }

  // Source (video title, url, excerpt)
  if (card.source) {
    if (card.source.title && card.source.title.toLowerCase().includes(q)) return true;
    if ("excerpt" in card.source && card.source.excerpt && card.source.excerpt.toLowerCase().includes(q)) {
      return true;
    }
  }

  return false;
}

export interface MatchedSnippet {
  field: string;
  snippet: string;
}

/**
 * Extracts a matching text snippet from the card to display in search result items.
 */
export function getMatchedSnippet(
  card: Card,
  query: string,
  tagById?: Map<string, Tag>
): MatchedSnippet {
  if (!query || !query.trim()) {
    return { field: "Question", snippet: card.question };
  }

  const q = query.trim().toLowerCase();

  if (card.question && card.question.toLowerCase().includes(q)) {
    return { field: "Question", snippet: card.question };
  }

  if (card.answer && card.answer.toLowerCase().includes(q)) {
    return { field: "Answer", snippet: card.answer };
  }

  if (card.clozeText && card.clozeText.toLowerCase().includes(q)) {
    return { field: "Cloze", snippet: card.clozeText };
  }

  if (card.explanation && card.explanation.toLowerCase().includes(q)) {
    return { field: "Explanation", snippet: card.explanation };
  }

  if (card.statements) {
    const match = card.statements.find((s) => s.text.toLowerCase().includes(q));
    if (match) return { field: "Statement", snippet: match.text };
  }

  if (card.pairs) {
    const match = card.pairs.find(
      (p) => p.left.toLowerCase().includes(q) || p.right.toLowerCase().includes(q)
    );
    if (match) {
      return { field: "Match Pair", snippet: `${match.left} ➔ ${match.right}` };
    }
  }

  if (card.answers) {
    const match = card.answers.find((a) => a.toLowerCase().includes(q));
    if (match) return { field: "Correct Answer", snippet: match };
  }

  if (card.tags && tagById) {
    for (const tid of card.tags) {
      const tag = tagById.get(tid);
      if (tag && tag.name.toLowerCase().includes(q)) {
        return { field: "Tag", snippet: `#${tag.name}` };
      }
    }
  }

  if (card.source && card.source.title && card.source.title.toLowerCase().includes(q)) {
    return { field: "Video Title", snippet: card.source.title };
  }

  return { field: "Question", snippet: card.question };
}
