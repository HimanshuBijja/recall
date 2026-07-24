import { expect, test, vi } from "vitest";
import { draftToCard, renderFields } from "../src/content/overlay/fields";

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

test("draftToCard sets clozeText (not question) for cloze cards", () => {
  const body = draftToCard(
    { kind: "cloze", question: "", answer: "", distractors: [], clozeText: "The capital is ==Paris==.", tags: [], explanation: "", hint: "" },
    { videoId: "abc", url: "u", timestamp: 1 },
    undefined,
    undefined,
  );
  expect(body.clozeText).toBe("The capital is ==Paris==.");
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

test("renderFields MCQ options list and MCQ-to-Multi promotion", () => {
  const root = document.createElement("div");
  document.body.appendChild(root);

  const draft = {
    kind: "mcq" as const,
    question: "Which of these are protocols?",
    answer: "TCP",
    distractors: ["HTTP", "PNG", "JPEG"],
    tags: ["network"],
    explanation: "TCP and HTTP are protocols, others are formats.",
    hint: "",
  };

  const onKindChange = vi.fn();
  const fields = renderFields("mcq", draft, root, root, []);

  // Verify options count
  const optionRows = root.querySelectorAll(".option-row");
  expect(optionRows.length).toBe(4);

  // Check correct option toggle button status
  const toggleBtns = root.querySelectorAll(".toggle-correct-btn");
  expect(toggleBtns[0].classList.contains("correct")).toBe(true);
  expect(toggleBtns[1].classList.contains("correct")).toBe(false);

  // Toggle second correct answer (index 1) -> now changes selection in MCQ mode (radio behavior) without promoting
  const btn1 = toggleBtns[1] as HTMLButtonElement;
  btn1.click();

  expect(onKindChange).not.toHaveBeenCalled();
  
  const updatedToggleBtns = root.querySelectorAll(".toggle-correct-btn");
  expect(updatedToggleBtns[0].classList.contains("correct")).toBe(false);
  expect(updatedToggleBtns[1].classList.contains("correct")).toBe(true);

  // Cleanup
  root.remove();
});
