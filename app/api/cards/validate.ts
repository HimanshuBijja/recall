import type { Card, CardKind, TfStatement, MatchPair, CardSource, MarkerShape } from "@/types";
import { parseCloze } from "@/lib/cloze";

const SHAPES: MarkerShape[] = ["circle", "square", "triangle", "diamond", "star"];

function normalizeSource(raw: unknown): CardSource | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.videoId !== "string" || !o.videoId) return undefined;
  if (typeof o.url !== "string" || typeof o.timestamp !== "number") return undefined;
  const src: CardSource = { videoId: o.videoId, url: o.url, timestamp: o.timestamp };
  if (typeof o.channel === "string") src.channel = o.channel;
  if (typeof o.title === "string") src.title = o.title;
  if (typeof o.screenshotUrl === "string") src.screenshotUrl = o.screenshotUrl;
  const m = o.marker as Record<string, unknown> | undefined;
  if (m && SHAPES.includes(m.shape as MarkerShape) && typeof m.color === "string") {
    src.marker = { shape: m.shape as MarkerShape, color: m.color };
  }
  return src;
}

function normalizeStatements(raw: unknown): TfStatement[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => {
      if (s && typeof s === "object") {
        const o = s as { text?: unknown; isTrue?: unknown };
        return { text: String(o.text ?? "").trim(), isTrue: Boolean(o.isTrue) };
      }
      return { text: "", isTrue: false };
    })
    .filter((s) => s.text.length > 0);
}

function normalizePairs(raw: unknown): MatchPair[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      if (p && typeof p === "object") {
        const o = p as { left?: unknown; right?: unknown };
        return { left: String(o.left ?? "").trim(), right: String(o.right ?? "").trim() };
      }
      return { left: "", right: "" };
    })
    .filter((p) => p.left.length > 0 && p.right.length > 0);
}

export function buildCardFromInput(input: unknown): { card?: Omit<Card, "id" | "createdAt">; error?: string } {
  if (!input || typeof input !== "object") {
    return { error: "invalid input" };
  }
  const body = input as Record<string, unknown>;
  const kind = (body.kind as CardKind) || "mcq";

  if (!body.question && kind !== "cloze") {
    return { error: "question is required" };
  }

  const difficulty = Number(body.difficulty ?? 3);
  if (isNaN(difficulty) || difficulty < 1 || difficulty > 5) {
    return { error: "difficulty must be between 1 and 5" };
  }

  const baseCard = {
    kind,
    explanation: String(body.explanation ?? ""),
    hint: String(body.hint ?? ""),
    difficulty: difficulty as Card["difficulty"],
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
    bookmarked: body.bookmarked !== undefined ? Boolean(body.bookmarked) : undefined,
    source: normalizeSource(body.source),
  };

  if (kind === "mcq") {
    if (!body.answer) {
      return { error: "answer is required for mcq cards" };
    }
    const distractors = Array.isArray(body.distractors)
      ? body.distractors.map(s => String(s ?? "").trim()).filter(Boolean)
      : [];
    return {
      card: {
        ...baseCard,
        question: String(body.question).trim(),
        answer: String(body.answer).trim(),
        distractors,
      },
    };
  }

  if (kind === "tf-sort") {
    const statements = normalizeStatements(body.statements);
    if (statements.length < 2) {
      return { error: "tf-sort cards need at least 2 statements" };
    }
    return {
      card: {
        ...baseCard,
        question: String(body.question).trim(),
        answer: "",
        distractors: [],
        statements,
      },
    };
  }

  if (kind === "flash") {
    if (!body.answer) {
      return { error: "answer is required for flash cards" };
    }
    return {
      card: {
        ...baseCard,
        question: String(body.question).trim(),
        answer: String(body.answer).trim(),
        distractors: [],
      },
    };
  }

  if (kind === "cloze") {
    const clozeText = String(body.clozeText ?? "").trim();
    if (!clozeText) {
      return { error: "clozeText is required for cloze cards" };
    }
    const { answers } = parseCloze(clozeText);
    if (answers.length < 1) {
      return { error: "clozeText must contain at least one blank using ==answer== syntax" };
    }
    return {
      card: {
        ...baseCard,
        question: String(body.question ?? clozeText).trim(),
        answer: "",
        distractors: [],
        clozeText,
      },
    };
  }

  if (kind === "match") {
    const pairs = normalizePairs(body.pairs);
    if (pairs.length < 2) {
      return { error: "match cards need at least 2 pairs" };
    }
    return {
      card: {
        ...baseCard,
        question: String(body.question ?? "").trim(),
        answer: "",
        distractors: [],
        pairs,
      },
    };
  }

  return { error: `unknown card kind: ${kind}` };
}
