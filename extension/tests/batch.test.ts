import { expect, test, beforeEach } from "vitest";
import { openBatchOverlay } from "../src/content/overlay/batch";
import type { CardDraft } from "../src/shared/types";

const source = {
  type: "web" as const,
  url: "https://mdn.io/p",
  title: "T",
  siteName: "MDN",
  excerpt: "passage",
  capturedAt: "2026-07-25T00:00:00.000Z",
};

function mcq(q: string, a: string): CardDraft {
  return { kind: "mcq", question: q, answer: a, distractors: ["x", "y", "z"], tags: ["css"], explanation: "", hint: "" };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

function shadow(): ShadowRoot {
  const host = document.getElementById("recall-batch-overlay-host");
  if (!host?.shadowRoot) throw new Error("batch host not mounted");
  return host.shadowRoot;
}

test("renders one section per draft with a numbered header", () => {
  const pending = openBatchOverlay({ kind: "mcq", drafts: [mcq("Q1", "A1"), mcq("Q2", "A2")], source });
  const sections = shadow().querySelectorAll(".batch-card");
  expect(sections).toHaveLength(2);
  expect(shadow().querySelectorAll(".batch-index")[0].textContent).toBe("1");
  expect(shadow().querySelectorAll(".batch-index")[1].textContent).toBe("2");
  expect(shadow().querySelector(".batch-count")?.textContent).toBe("2 cards");
  shadow().querySelector<HTMLButtonElement>(".cancel")!.click();
  return pending;
});

test("save resolves with one POST body per kept card", async () => {
  const pending = openBatchOverlay({ kind: "mcq", drafts: [mcq("Q1", "A1"), mcq("Q2", "A2")], source });
  shadow().querySelector<HTMLButtonElement>(".save")!.click();
  const result = await pending;
  expect(result.action).toBe("save");
  if (result.action !== "save") throw new Error("expected save");
  expect(result.cards).toHaveLength(2);
  expect(result.cards[0]).toMatchObject({ kind: "mcq", question: "Q1", answer: "A1", source });
  expect(document.getElementById("recall-batch-overlay-host")).toBeNull();
});

test("discarding a card removes it from the saved set and updates the count", async () => {
  const pending = openBatchOverlay({ kind: "mcq", drafts: [mcq("Q1", "A1"), mcq("Q2", "A2")], source });
  shadow().querySelectorAll<HTMLButtonElement>(".batch-discard")[0].click();
  expect(shadow().querySelector(".batch-count")?.textContent).toBe("1 card");
  shadow().querySelector<HTMLButtonElement>(".save")!.click();
  const result = await pending;
  if (result.action !== "save") throw new Error("expected save");
  expect(result.cards).toHaveLength(1);
  expect(result.cards[0]).toMatchObject({ question: "Q2" });
});

test("cancel resolves with the cancel action and unmounts", async () => {
  const pending = openBatchOverlay({ kind: "mcq", drafts: [mcq("Q1", "A1")], source });
  shadow().querySelector<HTMLButtonElement>(".cancel")!.click();
  await expect(pending).resolves.toEqual({ action: "cancel" });
  expect(document.getElementById("recall-batch-overlay-host")).toBeNull();
});

test("save is disabled once every card is discarded", async () => {
  const pending = openBatchOverlay({ kind: "mcq", drafts: [mcq("Q1", "A1")], source });
  shadow().querySelectorAll<HTMLButtonElement>(".batch-discard")[0].click();
  expect(shadow().querySelector<HTMLButtonElement>(".save")!.disabled).toBe(true);
  expect(shadow().querySelector(".batch-count")?.textContent).toBe("0 cards");
  shadow().querySelector<HTMLButtonElement>(".cancel")!.click();
  await pending;
});

test("edits made in a card body are reflected in the saved body", async () => {
  const pending = openBatchOverlay({ kind: "mcq", drafts: [mcq("Q1", "A1")], source });
  const question = shadow().querySelector<HTMLTextAreaElement>('[data-field="question"]')!;
  question.value = "edited question";
  shadow().querySelector<HTMLButtonElement>(".save")!.click();
  const result = await pending;
  if (result.action !== "save") throw new Error("expected save");
  expect(result.cards[0]).toMatchObject({ question: "edited question" });
});
