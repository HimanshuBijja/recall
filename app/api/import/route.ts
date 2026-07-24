import { NextRequest } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import type { Card, CardKind, Group, Tag, TfStatement } from "@/types";
import { normalizeSource } from "@/app/api/cards/validate";

interface BundleStatement {
  text?: unknown;
  isTrue?: unknown;
}

interface BundleCard {
  kind?: CardKind;
  question?: string;
  answer?: string;
  distractors?: string[];
  answers?: string[];
  statements?: BundleStatement[];
  clozeText?: string;
  text?: string;
  pairs?: Array<{ left?: unknown; right?: unknown } | unknown[]>;
  explanation?: string;
  hint?: string;
  difficulty?: number;
  tags?: string[];
  source?: unknown;
}

/**
 * Accepts a few looser paste shapes alongside the canonical one, so pastes
 * from ad-hoc AI prompts don't get silently dropped: cloze `text` (alias for
 * `clozeText`), tf-sort `{statement,truth}` (aliases for `text`/`isTrue`),
 * and match tuple pairs `["a","b"]` (alias for `{left,right}`). Mutates in
 * place before the existing per-kind branches run.
 */
function normalizeAliases(item: BundleCard): void {
  if (item.kind === "cloze" && !item.clozeText && typeof item.text === "string") {
    item.clozeText = item.text;
  }
  if (item.kind === "tf-sort" && Array.isArray(item.statements)) {
    item.statements = item.statements.map((s) => {
      const o = s as { text?: unknown; statement?: unknown; isTrue?: unknown; truth?: unknown };
      return { text: o.text ?? o.statement, isTrue: o.isTrue ?? o.truth };
    });
  }
  if (item.kind === "match" && Array.isArray(item.pairs)) {
    item.pairs = item.pairs.map((p) =>
      Array.isArray(p) ? { left: p[0], right: p[1] } : p
    );
  }
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

  const cards = await readDb<Card>("cards.json");
  const tags = await readDb<Tag>("tags.json");
  const groups = await readDb<Group>("groups.json");

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
    normalizeAliases(item);
    const kind: CardKind = item.kind || "mcq";
    if (kind !== "cloze" && typeof item.question !== "string") continue;
    if (kind === "cloze" && typeof item.clozeText !== "string") continue;

    const tagIds = (item.tags ?? [])
      .filter((n): n is string => typeof n === "string" && !!n.trim())
      .map((n) => ensureTag(n.trim()).id);

    const baseCard = {
      id: crypto.randomUUID(),
      kind,
      explanation: item.explanation ?? "",
      hint: item.hint ?? "",
      difficulty: ((item.difficulty ?? 3) as Card["difficulty"]),
      tags: tagIds,
      createdAt: new Date().toISOString(),
      source: normalizeSource(item.source),
    };

    let card: Card;
    if (kind === "mcq") {
      if (typeof item.answer !== "string") continue;
      card = {
        ...baseCard,
        question: item.question || "",
        answer: item.answer,
        distractors: Array.isArray(item.distractors) ? item.distractors.map(String) : [],
      };
    } else if (kind === "multi") {
      const answers = Array.isArray(item.answers) ? item.answers.map(String).map((s) => s.trim()).filter(Boolean) : [];
      const distractors = Array.isArray(item.distractors) ? item.distractors.map(String).map((s) => s.trim()).filter(Boolean) : [];
      if (answers.length < 1 || answers.length + distractors.length < 2) continue;
      card = {
        ...baseCard,
        question: item.question || "",
        answer: "",
        answers,
        distractors,
      };
    } else if (kind === "tf-sort") {
      const statements: TfStatement[] = Array.isArray(item.statements)
        ? item.statements
            .map((s) => ({
              text: typeof s?.text === "string" ? s.text.trim() : "",
              isTrue: Boolean(s?.isTrue),
            }))
            .filter((s) => s.text.length > 0)
        : [];
      if (statements.length < 2) continue;
      card = {
        ...baseCard,
        question: item.question || "",
        answer: "",
        distractors: [],
        statements,
      };
    } else if (kind === "flash") {
      if (typeof item.answer !== "string") continue;
      card = {
        ...baseCard,
        question: item.question || "",
        answer: item.answer,
        distractors: [],
      };
    } else if (kind === "cloze") {
      card = {
        ...baseCard,
        question: item.question || item.clozeText || "",
        answer: "",
        distractors: [],
        clozeText: item.clozeText || "",
      };
    } else if (kind === "match") {
      const pairs = Array.isArray(item.pairs)
        ? item.pairs
            .map((p) => {
              const o = (p ?? {}) as { left?: unknown; right?: unknown };
              return { left: String(o.left ?? "").trim(), right: String(o.right ?? "").trim() };
            })
            .filter((p) => p.left.length > 0 && p.right.length > 0)
        : [];
      if (pairs.length < 2) continue;
      card = {
        ...baseCard,
        question: item.question || "",
        answer: "",
        distractors: [],
        pairs,
      };
    } else {
      continue;
    }

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

  await writeDb("tags.json", tags);
  await writeDb("cards.json", cards);
  await writeDb("groups.json", groups);

  return Response.json(
    {
      cards: { inserted: cardsInserted },
      tags: { inserted: tagsInserted, updated: tagsUpdated },
      groups: { inserted: groupsInserted, updated: groupsUpdated },
    },
    { status: 201 }
  );
}
