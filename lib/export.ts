import type { Card, Group, Tag } from "@/types";

/**
 * Exported shapes mirror the import format: tag/group references are by
 * name (case-insensitive on re-import), not by internal UUID.
 */
export interface ExportedCard {
  question: string;
  answer: string;
  distractors: string[];
  explanation: string;
  hint: string;
  difficulty: number;
  tags: string[];
}

export interface ExportedTag {
  name: string;
  parents: string[];
}

export interface ExportedGroup {
  name: string;
  tags: string[];
}

export interface ExportedBundle {
  cards: ExportedCard[];
  tags: ExportedTag[];
  groups: ExportedGroup[];
}

export function exportCard(card: Card, tagById: Map<string, Tag>): ExportedCard {
  return {
    question: card.question,
    answer: card.answer,
    distractors: [...card.distractors],
    explanation: card.explanation ?? "",
    hint: card.hint ?? "",
    difficulty: card.difficulty,
    tags: card.tags.map((id) => tagById.get(id)?.name).filter(Boolean) as string[],
  };
}

export function exportCards(cards: Card[], tags: Tag[]): ExportedCard[] {
  const tagById = new Map(tags.map((t) => [t.id, t] as const));
  return cards.map((c) => exportCard(c, tagById));
}

export function exportTag(tag: Tag, tagById: Map<string, Tag>): ExportedTag {
  return {
    name: tag.name,
    parents: tag.parents.map((id) => tagById.get(id)?.name).filter(Boolean) as string[],
  };
}

export function exportTags(tags: Tag[]): ExportedTag[] {
  const tagById = new Map(tags.map((t) => [t.id, t] as const));
  return tags.map((t) => exportTag(t, tagById));
}

export function exportGroup(group: Group, tagById: Map<string, Tag>): ExportedGroup {
  return {
    name: group.name,
    tags: group.tagIds.map((id) => tagById.get(id)?.name).filter(Boolean) as string[],
  };
}

export function exportGroups(groups: Group[], tags: Tag[]): ExportedGroup[] {
  const tagById = new Map(tags.map((t) => [t.id, t] as const));
  return groups.map((g) => exportGroup(g, tagById));
}

export function exportBundle(cards: Card[], tags: Tag[], groups: Group[]): ExportedBundle {
  return {
    cards: exportCards(cards, tags),
    tags: exportTags(tags),
    groups: exportGroups(groups, tags),
  };
}
