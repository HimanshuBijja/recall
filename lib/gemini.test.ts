import { expect, test } from "vitest";
import { parseDraft } from "@/lib/gemini";

test("parseDraft reads a fenced JSON mcq draft", () => {
  const raw = "```json\n" + JSON.stringify({
    question: "Big-O of binary search?", answer: "O(log n)",
    distractors: ["O(n)", "O(1)", "O(n log n)"], tags: ["algorithms"],
    explanation: "Halves the range each step.", hint: "Divide and conquer",
  }) + "\n```";
  const d = parseDraft(raw, "mcq");
  expect(d.kind).toBe("mcq");
  expect(d.answer).toBe("O(log n)");
  expect(d.distractors).toHaveLength(3);
  expect(d.tags).toContain("algorithms");
});

test("parseDraft on garbage returns an empty draft of the kind", () => {
  const d = parseDraft("sorry I cannot", "cloze");
  expect(d.kind).toBe("cloze");
  expect(d.clozeText).toBe("");
  expect(d.tags).toEqual([]);
});

test("parseDraft reads a fenced JSON multi draft", () => {
  const raw = "```json\n" + JSON.stringify({
    question: "Which are transport-layer protocols?", answers: ["TCP", "UDP"],
    distractors: ["HTTP", "FTP"], tags: ["networking"],
    explanation: "TCP and UDP are layer 4.", hint: "Connection-oriented vs connectionless",
  }) + "\n```";
  const d = parseDraft(raw, "multi");
  expect(d.kind).toBe("multi");
  expect(d.answers).toEqual(["TCP", "UDP"]);
  expect(d.distractors).toEqual(["HTTP", "FTP"]);
  expect(d.tags).toContain("networking");
});

import { parseDrafts } from "@/lib/gemini";

test("parseDrafts reads a fenced JSON array of mcq drafts", () => {
  const raw = "```json\n" + JSON.stringify([
    { question: "Q1", answer: "A1", distractors: ["x", "y", "z"], tags: ["css"], explanation: "", hint: "" },
    { question: "Q2", answer: "A2", distractors: ["p", "q", "r"], tags: ["css"], explanation: "", hint: "" },
  ]) + "\n```";
  const drafts = parseDrafts(raw, "mcq", 10);
  expect(drafts).toHaveLength(2);
  expect(drafts[0].question).toBe("Q1");
  expect(drafts[1].answer).toBe("A2");
  expect(drafts.every((d) => d.kind === "mcq")).toBe(true);
});

test("parseDrafts unwraps a { cards: [...] } envelope", () => {
  const raw = JSON.stringify({ cards: [{ question: "Q", answer: "A", distractors: [], tags: [], explanation: "", hint: "" }] });
  expect(parseDrafts(raw, "mcq", 10)).toHaveLength(1);
});

test("parseDrafts accepts a bare single object", () => {
  const raw = JSON.stringify({ question: "Q", answer: "A", distractors: [], tags: [], explanation: "", hint: "" });
  expect(parseDrafts(raw, "mcq", 10)).toHaveLength(1);
});

test("parseDrafts drops content-free entries", () => {
  const raw = JSON.stringify([
    { question: "Q", answer: "A", distractors: [], tags: [], explanation: "", hint: "" },
    { question: "", answer: "", distractors: [], tags: [], explanation: "", hint: "" },
  ]);
  expect(parseDrafts(raw, "mcq", 10)).toHaveLength(1);
});

test("parseDrafts enforces the max cap", () => {
  const raw = JSON.stringify(
    Array.from({ length: 9 }, (_, i) => ({ question: `Q${i}`, answer: "A", distractors: [], tags: [], explanation: "", hint: "" })),
  );
  expect(parseDrafts(raw, "mcq", 3)).toHaveLength(3);
});

test("parseDrafts on garbage returns an empty array", () => {
  expect(parseDrafts("sorry I cannot", "flash", 5)).toEqual([]);
});

test("parseDrafts keeps tf-sort statements and drops under-filled ones", () => {
  const raw = JSON.stringify([
    { question: "Sort these", statements: [{ text: "a", isTrue: true }, { text: "b", isTrue: false }], tags: [], explanation: "", hint: "" },
    { question: "Too few", statements: [{ text: "only one", isTrue: true }], tags: [], explanation: "", hint: "" },
  ]);
  const drafts = parseDrafts(raw, "tf-sort", 10);
  expect(drafts).toHaveLength(1);
  expect(drafts[0].statements).toHaveLength(2);
});
