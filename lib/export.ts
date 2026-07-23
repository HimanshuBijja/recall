import type { Card, CardKind, CardSource, Group, Tag, TfStatement } from "@/types";

export interface ExportedCard {
  kind?: CardKind;
  question: string;
  answer: string;
  distractors: string[];
  statements?: TfStatement[];
  clozeText?: string;
  pairs?: Array<{ left: string; right: string }>;
  explanation: string;
  hint: string;
  difficulty: number;
  tags: string[];
  source?: CardSource;
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
  const isTf = card.kind === "tf-sort";
  const isCloze = card.kind === "cloze";
  const isMatch = card.kind === "match";
  const isMcq = !card.kind || card.kind === "mcq";
  const isFlash = card.kind === "flash";

  return {
    kind: card.kind ?? "mcq",
    question: card.question,
    answer: (isMcq || isFlash) ? card.answer : "",
    distractors: isMcq ? [...(card.distractors ?? [])] : [],
    statements: isTf && card.statements ? card.statements.map((s) => ({ ...s })) : undefined,
    clozeText: isCloze ? card.clozeText : undefined,
    pairs: isMatch && card.pairs ? card.pairs.map((p) => ({ ...p })) : undefined,
    explanation: card.explanation ?? "",
    hint: card.hint ?? "",
    difficulty: card.difficulty,
    tags: (card.tags ?? []).map((id) => tagById.get(id)?.name).filter(Boolean) as string[],
    source: card.source,
  };
}

export function exportCards(cards: Card[], tags: Tag[]): ExportedCard[] {
  const tagById = new Map(tags.map((t) => [t.id, t] as const));
  return cards.map((c) => exportCard(c, tagById));
}

export function exportTag(tag: Tag, tagById: Map<string, Tag>): ExportedTag {
  return {
    name: tag.name,
    parents: (tag.parents ?? []).map((id) => tagById.get(id)?.name).filter(Boolean) as string[],
  };
}

export function exportTags(tags: Tag[]): ExportedTag[] {
  const tagById = new Map(tags.map((t) => [t.id, t] as const));
  return tags.map((t) => exportTag(t, tagById));
}

export function exportGroup(group: Group, tagById: Map<string, Tag>): ExportedGroup {
  return {
    name: group.name,
    tags: (group.tagIds ?? []).map((id) => tagById.get(id)?.name).filter(Boolean) as string[],
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
