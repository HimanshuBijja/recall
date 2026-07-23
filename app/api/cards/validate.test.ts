import { expect, test } from "vitest";
import { buildCardFromInput } from "@/app/api/cards/validate";

test("flash requires question and answer", () => {
  expect(buildCardFromInput({ kind: "flash", question: "Q", answer: "A" }).card?.kind).toBe("flash");
  expect(buildCardFromInput({ kind: "flash", question: "Q" }).error).toMatch(/answer/i);
});

test("mcq still needs answer", () => {
  expect(buildCardFromInput({ kind: "mcq", question: "Q" }).error).toMatch(/answer/i);
});

test("cloze requires clozeText with blanks", () => {
  expect(buildCardFromInput({ kind: "cloze", clozeText: "Hello ==World==" }).card?.kind).toBe("cloze");
  expect(buildCardFromInput({ kind: "cloze", clozeText: "Hello World" }).error).toMatch(/blank/i);
});

test("match requires at least 2 pairs", () => {
  const result = buildCardFromInput({
    kind: "match",
    question: "Match",
    pairs: [{ left: "a", right: "1" }, { left: "b", right: "2" }]
  });
  expect(result.card?.kind).toBe("match");
  expect(buildCardFromInput({ kind: "match", question: "Match", pairs: [{ left: "a", right: "1" }] }).error).toMatch(/pairs/i);
});
