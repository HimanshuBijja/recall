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

import { buildWebSource } from "../src/web/selection";

test("draftToCard attaches a web source verbatim and skips screenshot/marker", () => {
  const src = buildWebSource(
    { text: "passage", url: "https://mdn.io/p", title: "T", siteName: "MDN" },
    () => "2026-07-25T00:00:00.000Z",
  );
  const body = draftToCard(
    { kind: "flash", question: "Q", answer: "A", distractors: [], tags: [], explanation: "", hint: "" },
    src,
  );
  expect(body.source).toEqual({
    type: "web",
    url: "https://mdn.io/p",
    title: "T",
    siteName: "MDN",
    excerpt: "passage",
    capturedAt: "2026-07-25T00:00:00.000Z",
  });
});

test("renderFields table layout renders an index cell per mcq option", () => {
  const kindRoot = document.createElement("div");
  const metaRoot = document.createElement("div");
  renderFields(
    "mcq",
    { kind: "mcq", question: "Q", answer: "A", distractors: ["b", "c"], tags: [], explanation: "", hint: "" },
    kindRoot,
    metaRoot,
    [],
    "table",
  );
  const rows = kindRoot.querySelectorAll(".option-row");
  expect(rows).toHaveLength(3);
  expect(kindRoot.querySelector(".options-table-head")).not.toBeNull();
  expect(rows[0].querySelector(".option-index")?.textContent).toBe("1");
  expect(rows[2].querySelector(".option-index")?.textContent).toBe("3");
});

test("renderFields table layout still reads back correct answers and distractors", () => {
  const kindRoot = document.createElement("div");
  const metaRoot = document.createElement("div");
  const fields = renderFields(
    "multi",
    { kind: "multi", question: "Q", answer: "", answers: ["A", "B"], distractors: ["c"], tags: [], explanation: "", hint: "" },
    kindRoot,
    metaRoot,
    [],
    "table",
  );
  const values = fields.readValues();
  expect(values.answers).toEqual(["A", "B"]);
  expect(values.distractors).toEqual(["c"]);
});

test("renderFields defaults to the row layout with no index cells", () => {
  const kindRoot = document.createElement("div");
  const metaRoot = document.createElement("div");
  renderFields(
    "mcq",
    { kind: "mcq", question: "Q", answer: "A", distractors: ["b"], tags: [], explanation: "", hint: "" },
    kindRoot,
    metaRoot,
    [],
  );
  expect(kindRoot.querySelector(".options-table-head")).toBeNull();
  expect(kindRoot.querySelector(".option-index")).toBeNull();
});
