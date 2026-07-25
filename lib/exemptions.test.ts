import { describe, expect, it } from "vitest";
import type { Card, Group, Subject, Tag } from "@/types";
import { getCardExemptionMap, filterExemptedCards } from "./exemptions";

describe("spaced repetition card exemptions", () => {
  const mockTags: Tag[] = [
    { id: "t1", name: "programming", parents: [] },
    { id: "t2", name: "typescript", parents: ["t1"] },
  ];

  const mockCards: Card[] = [
    { id: "c1", question: "Q1", answer: "A1", distractors: [], tags: ["t1"], createdAt: "", difficulty: 1, explanation: "", hint: "" } as Card,
    { id: "c2", question: "Q2", answer: "A2", distractors: [], tags: ["t2"], createdAt: "", difficulty: 1, explanation: "", hint: "" } as Card,
    { id: "c3", question: "Q3", answer: "A3", distractors: [], tags: ["t1"], createdAt: "", difficulty: 1, explanation: "", hint: "" } as Card,
    { id: "c4", question: "Q4", answer: "A4", distractors: [], tags: [], createdAt: "", source: { videoId: "v1", url: "", timestamp: 0 }, difficulty: 1, explanation: "", hint: "" } as Card,
  ];

  it("includes cards that belong to no groups or subjects", () => {
    const map = getCardExemptionMap(mockCards, [], [], mockTags);
    expect(map.get("c1")).toBe(false);
    expect(map.get("c2")).toBe(false);
    expect(map.get("c4")).toBe(false);
  });

  it("exempts cards that are only in exempted groups", () => {
    const groups: Group[] = [
      { id: "g1", name: "Group 1", tagIds: ["t1"], createdAt: "", exempted: true },
    ];
    // t1 and t2 (descendant of t1) are both matched
    const map = getCardExemptionMap(mockCards, groups, [], mockTags);
    expect(map.get("c1")).toBe(true);
    expect(map.get("c2")).toBe(true);
    expect(map.get("c3")).toBe(true);
    expect(map.get("c4")).toBe(false); // video group not matched
  });

  it("includes cards if they belong to at least one non-exempted group", () => {
    const groups: Group[] = [
      { id: "g1", name: "Group 1", tagIds: ["t1"], createdAt: "", exempted: true },
      { id: "g2", name: "Group 2", tagIds: ["t2"], createdAt: "", exempted: false },
    ];
    const map = getCardExemptionMap(mockCards, groups, [], mockTags);
    // c1 is only in g1 (exempted)
    expect(map.get("c1")).toBe(true);
    // c2 is in g1 (via parent t1) and g2 (not exempted)
    expect(map.get("c2")).toBe(false);
  });

  it("exempts video-based group cards if the group is exempted", () => {
    const groups: Group[] = [
      { id: "g_vid", name: "Video Group", tagIds: [], videoId: "v1", createdAt: "", exempted: true },
    ];
    const map = getCardExemptionMap(mockCards, groups, [], mockTags);
    expect(map.get("c4")).toBe(true);
  });

  it("handles subject exemptions and overlaps", () => {
    const groups: Group[] = [
      { id: "g1", name: "Group 1", tagIds: ["t1"], createdAt: "", exempted: true },
      { id: "g2", name: "Group 2", tagIds: ["t2"], createdAt: "", exempted: true },
    ];
    const subjects: Subject[] = [
      { id: "s1", name: "Subject 1", groupIds: ["g1"], createdAt: "", exempted: true },
      { id: "s2", name: "Subject 2", groupIds: ["g2"], createdAt: "", exempted: false },
    ];
    const map = getCardExemptionMap(mockCards, groups, subjects, mockTags);
    // c1 is in g1, which is in s1 (exempted). So c1 matches g1 (exempted) and s1 (exempted).
    expect(map.get("c1")).toBe(true);
    // c2 is in g2, which is in s2 (NOT exempted). So c2 matches g2 (exempt) but s2 (NOT exempt).
    expect(map.get("c2")).toBe(false);
  });

  it("filters exempted cards correctly", () => {
    const groups: Group[] = [
      { id: "g1", name: "Group 1", tagIds: ["t1"], createdAt: "", exempted: true },
    ];
    const filtered = filterExemptedCards(mockCards, groups, [], mockTags);
    expect(filtered.map((c) => c.id)).toEqual(["c4"]);
  });
});
