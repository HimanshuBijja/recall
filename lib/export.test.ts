import { expect, test } from "vitest";
import { exportTag, exportCard, exportGroup, exportBundle } from "./export";
import type { Card, Group, Tag } from "@/types";

test("exportTag handles tag without parents field gracefully", () => {
  const tagWithoutParents = { id: "t1", name: "Tag 1" } as unknown as Tag;
  const tagMap = new Map([[tagWithoutParents.id, tagWithoutParents]]);
  
  const exported = exportTag(tagWithoutParents, tagMap);
  expect(exported).toEqual({
    name: "Tag 1",
    parents: [],
  });
});

test("exportCard and exportGroup handle missing tags/tagIds gracefully", () => {
  const cardWithoutTags = {
    id: "c1",
    kind: "mcq",
    question: "Q",
    answer: "A",
    distractors: ["B", "C", "D"],
    explanation: "",
    hint: "",
    difficulty: 3,
    createdAt: "",
  } as unknown as Card;

  const exportedCard = exportCard(cardWithoutTags, new Map());
  expect(exportedCard.tags).toEqual([]);

  const groupWithoutTags = {
    id: "g1",
    name: "Group 1",
    createdAt: "",
  } as unknown as Group;

  const exportedGroup = exportGroup(groupWithoutTags, new Map());
  expect(exportedGroup.tags).toEqual([]);
});

test("export preserves source", () => {
  const card = {
    id: "1", kind: "flash", question: "Q", answer: "A", distractors: [],
    explanation: "", hint: "", difficulty: 3, tags: [], createdAt: "",
    source: { videoId: "abc", url: "u", timestamp: 3 },
  } as Card;
  expect(exportCard(card, new Map()).source).toEqual({ videoId: "abc", url: "u", timestamp: 3 });
});

test("export omits source when absent", () => {
  const card = {
    id: "2", kind: "flash", question: "Q", answer: "A", distractors: [],
    explanation: "", hint: "", difficulty: 3, tags: [], createdAt: "",
  } as Card;
  expect(exportCard(card, new Map()).source).toBeUndefined();
});

test("exports answers for multi cards and omits them otherwise", () => {
  const tagById = new Map();
  const multi = exportCard(
    { id: "1", kind: "multi", question: "Q", answer: "", answers: ["a", "b"], distractors: ["c"], explanation: "", hint: "", difficulty: 3, tags: [], createdAt: "x" } as Card,
    tagById,
  );
  expect(multi).toMatchObject({ kind: "multi", answers: ["a", "b"], distractors: ["c"], answer: "" });
  const mcq = exportCard(
    { id: "2", kind: "mcq", question: "Q", answer: "a", distractors: ["b", "c", "d"], explanation: "", hint: "", difficulty: 3, tags: [], createdAt: "x" } as Card,
    tagById,
  );
  expect(mcq.answers).toBeUndefined();
});
