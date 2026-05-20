import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { Card, CardKind, Group, Tag, TfStatement } from "@/types";

interface BundleStatement {
  text?: unknown;
  isTrue?: unknown;
}

interface BundleCard {
  kind?: CardKind;
  question: string;
  answer?: string;
  distractors?: string[];
  statements?: BundleStatement[];
  explanation?: string;
  hint?: string;
  difficulty?: number;
  tags?: string[];
}

interface BundleTag {
  name: string;
  parents?: string[];
}

interface BundleGroup {
  name: string;
  tags?: string[];
  tagIds?: string[];
}

interface Bundle {
  cards?: BundleCard[];
  tags?: BundleTag[];
  groups?: BundleGroup[];
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Bundle | BundleCard[];
  const bundle: Bundle = Array.isArray(body) ? { cards: body } : (body ?? {});

  const cards = readDb<Card>("cards.json");
  const tags = readDb<Tag>("tags.json");
  const groups = readDb<Group>("groups.json");

  const tagByName = new Map(tags.map((t) => [t.name.toLowerCase(), t]));

  function ensureTag(name: string): Tag {
    const key = name.toLowerCase();
    let tag = tagByName.get(key);
    if (!tag) {
      tag = { id: crypto.randomUUID(), name, parents: [] };
      tags.push(tag);
      tagByName.set(key, tag);
    }
    return tag;
  }

  let tagsInserted = 0;
  let tagsUpdated = 0;
  for (const t of bundle.tags ?? []) {
    if (typeof t?.name !== "string" || !t.name.trim()) continue;
    const existed = tagByName.has(t.name.toLowerCase());
    const tag = ensureTag(t.name.trim());
    if (Array.isArray(t.parents)) {
      const parentIds = t.parents
        .filter((p): p is string => typeof p === "string" && !!p.trim())
        .map((p) => ensureTag(p.trim()).id)
        .filter((id) => id !== tag.id);
      const before = tag.parents.length;
      tag.parents = Array.from(new Set([...tag.parents, ...parentIds]));
      if (existed && tag.parents.length !== before) tagsUpdated += 1;
    }
    if (!existed) tagsInserted += 1;
  }

  let cardsInserted = 0;
  for (const item of bundle.cards ?? []) {
    if (typeof item?.question !== "string") continue;
    const kind: CardKind = item.kind === "tf-sort" ? "tf-sort" : "mcq";
    const statements: TfStatement[] = Array.isArray(item.statements)
      ? item.statements
          .map((s) => ({
            text: typeof s?.text === "string" ? s.text.trim() : "",
            isTrue: Boolean(s?.isTrue),
          }))
          .filter((s) => s.text.length > 0)
      : [];
    if (kind === "mcq" && typeof item.answer !== "string") continue;
    if (kind === "tf-sort" && statements.length < 2) continue;
    const tagIds = (item.tags ?? [])
      .filter((n): n is string => typeof n === "string" && !!n.trim())
      .map((n) => ensureTag(n.trim()).id);
    const card: Card = {
      id: crypto.randomUUID(),
      kind,
      question: item.question,
      answer: kind === "mcq" ? (item.answer ?? "") : "",
      distractors:
        kind === "mcq" && Array.isArray(item.distractors)
          ? item.distractors.map(String)
          : [],
      statements: kind === "tf-sort" ? statements : undefined,
      explanation: item.explanation ?? "",
      hint: item.hint ?? "",
      difficulty: ((item.difficulty ?? 3) as Card["difficulty"]),
      tags: tagIds,
      createdAt: new Date().toISOString(),
    };
    cards.push(card);
    cardsInserted += 1;
  }

  const groupByName = new Map(groups.map((g) => [g.name.toLowerCase(), g]));
  let groupsInserted = 0;
  let groupsUpdated = 0;
  for (const g of bundle.groups ?? []) {
    if (typeof g?.name !== "string" || !g.name.trim()) continue;
    const names = Array.isArray(g.tags) ? g.tags : [];
    const idList = Array.isArray(g.tagIds) ? g.tagIds : [];
    const tagIds = [
      ...names
        .filter((n): n is string => typeof n === "string" && !!n.trim())
        .map((n) => ensureTag(n.trim()).id),
      ...idList.filter((id): id is string => typeof id === "string"),
    ];
    const existing = groupByName.get(g.name.toLowerCase());
    if (existing) {
      const merged = Array.from(new Set([...existing.tagIds, ...tagIds]));
      if (merged.length !== existing.tagIds.length) {
        existing.tagIds = merged;
        groupsUpdated += 1;
      }
    } else {
      const group: Group = {
        id: crypto.randomUUID(),
        name: g.name.trim(),
        tagIds: Array.from(new Set(tagIds)),
        createdAt: new Date().toISOString(),
      };
      groups.push(group);
      groupByName.set(group.name.toLowerCase(), group);
      groupsInserted += 1;
    }
  }

  writeDb("tags.json", tags);
  writeDb("cards.json", cards);
  writeDb("groups.json", groups);

  return Response.json(
    {
      cards: { inserted: cardsInserted },
      tags: { inserted: tagsInserted, updated: tagsUpdated },
      groups: { inserted: groupsInserted, updated: groupsUpdated },
    },
    { status: 201 }
  );
}
