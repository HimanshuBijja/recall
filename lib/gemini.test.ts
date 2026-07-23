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
