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
