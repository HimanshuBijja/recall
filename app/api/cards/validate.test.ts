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

test("passes through a well-formed source", () => {
  const { card, error } = buildCardFromInput({
    kind: "mcq", question: "Q", answer: "A", distractors: ["b", "c", "d"],
    source: { videoId: "abc", url: "https://youtu.be/abc", timestamp: 12.5,
      channel: "Chan", title: "T", screenshotUrl: "https://r2/x.png",
      marker: { shape: "circle", color: "#f59e0b" } },
  });
  expect(error).toBeUndefined();
  expect(card!.source).toEqual({
    videoId: "abc", url: "https://youtu.be/abc", timestamp: 12.5,
    channel: "Chan", title: "T", screenshotUrl: "https://r2/x.png",
    marker: { shape: "circle", color: "#f59e0b" },
  });
});

test("omits source when absent", () => {
  const { card } = buildCardFromInput({ kind: "flash", question: "Q", answer: "A" });
  expect(card!.source).toBeUndefined();
});

test("drops a malformed source (missing videoId)", () => {
  const { card } = buildCardFromInput({
    kind: "flash", question: "Q", answer: "A",
    source: { url: "x", timestamp: 1 },
  });
  expect(card!.source).toBeUndefined();
});

test("multi accepts >=1 answer and >=2 total options", () => {
  const { card, error } = buildCardFromInput({
    kind: "multi",
    question: "Which are transport-layer protocols?",
    answers: ["TCP", "UDP"],
    distractors: ["HTTP", "FTP"],
  });
  expect(error).toBeUndefined();
  expect(card).toMatchObject({ kind: "multi", answer: "", answers: ["TCP", "UDP"], distractors: ["HTTP", "FTP"] });
});

test("multi rejects zero correct answers", () => {
  const { error } = buildCardFromInput({ kind: "multi", question: "Q", answers: [], distractors: ["a", "b"] });
  expect(error).toMatch(/at least 1 correct/i);
});

test("multi rejects fewer than 2 total options", () => {
  const { error } = buildCardFromInput({ kind: "multi", question: "Q", answers: ["only"], distractors: [] });
  expect(error).toMatch(/at least 2 options/i);
});
