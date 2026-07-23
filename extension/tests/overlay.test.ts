import { expect, test } from "vitest";
import { draftToCard } from "../src/content/overlay/fields";

test("draftToCard builds a POST body with source", () => {
  const body = draftToCard(
    { kind: "mcq", question: "Q", answer: "A", distractors: ["b", "c", "d"], tags: ["t"], explanation: "e", hint: "h" },
    { videoId: "abc", url: "u", timestamp: 5, channel: "c", title: "t" },
    "https://r2/x.png",
    { shape: "circle", color: "#f59e0b" },
  );
  expect(body).toMatchObject({
    kind: "mcq",
    question: "Q",
    answer: "A",
    distractors: ["b", "c", "d"],
    tags: ["t"],
    source: {
      videoId: "abc",
      url: "u",
      timestamp: 5,
      channel: "c",
      title: "t",
      screenshotUrl: "https://r2/x.png",
      marker: { shape: "circle", color: "#f59e0b" },
    },
  });
});

test("draftToCard carries kind-specific fields (tf-sort statements)", () => {
  const body = draftToCard(
    {
      kind: "tf-sort",
      question: "Sort these",
      answer: "",
      distractors: [],
      statements: [{ text: "x", isTrue: true }],
      tags: [],
      explanation: "",
      hint: "",
    },
    { videoId: "abc", url: "u", timestamp: 1 },
    undefined,
    undefined,
  );
  expect(body).toMatchObject({ kind: "tf-sort", statements: [{ text: "x", isTrue: true }] });
});
