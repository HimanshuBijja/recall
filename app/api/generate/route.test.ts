import { expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/gemini", () => ({
  draftCardsFromText: vi.fn(async () => ({
    drafts: [
      { kind: "mcq", question: "Q1", answer: "A1", distractors: ["b", "c", "d"], tags: ["css"], explanation: "", hint: "" },
      { kind: "mcq", question: "Q2", answer: "A2", distractors: ["b", "c", "d"], tags: ["css"], explanation: "", hint: "" },
    ],
    groupName: "CSS grid",
  })),
}));

import { POST } from "@/app/api/generate/route";

function req(body: unknown) {
  return new Request("http://localhost/api/generate", { method: "POST", body: JSON.stringify(body) }) as never;
}

beforeEach(() => vi.clearAllMocks());

test("returns drafts for a valid request", async () => {
  const res = await POST(req({ text: "Grid is a two-dimensional layout system.", kind: "mcq", count: 2, pageTitle: "CSS grid" }));
  const json = await res.json();
  expect(res.status).toBe(200);
  expect(json.ok).toBe(true);
  expect(json.drafts).toHaveLength(2);
  expect(json.drafts[0].question).toBe("Q1");
});

test("400 when text is missing or blank", async () => {
  expect((await POST(req({ kind: "mcq", count: 2 }))).status).toBe(400);
  expect((await POST(req({ text: "   ", kind: "mcq", count: 2 }))).status).toBe(400);
});

test("400 on an unknown kind", async () => {
  const res = await POST(req({ text: "some text", kind: "essay", count: 2 }));
  expect(res.status).toBe(400);
});

test("clamps count to the 1..20 range", async () => {
  const { draftCardsFromText } = await import("@/lib/gemini");
  await POST(req({ text: "some text", kind: "mcq", count: 99 }));
  expect(draftCardsFromText).toHaveBeenCalledWith("some text", "mcq", 20, undefined);
  vi.clearAllMocks();
  await POST(req({ text: "some text", kind: "mcq", count: 0 }));
  expect(draftCardsFromText).toHaveBeenCalledWith("some text", "mcq", 1, undefined);
});

test("500 with the message when generation throws", async () => {
  const { draftCardsFromText } = await import("@/lib/gemini");
  (draftCardsFromText as unknown as { mockRejectedValueOnce: (e: Error) => void }).mockRejectedValueOnce(new Error("quota exceeded"));
  const res = await POST(req({ text: "some text", kind: "mcq", count: 2 }));
  const json = await res.json();
  expect(res.status).toBe(500);
  expect(json.error).toBe("quota exceeded");
});

test("200 with an empty list when the model produced nothing usable", async () => {
  const { draftCardsFromText } = await import("@/lib/gemini");
  (draftCardsFromText as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({ drafts: [], groupName: "" });
  const res = await POST(req({ text: "some text", kind: "mcq", count: 2 }));
  const json = await res.json();
  expect(res.status).toBe(200);
  expect(json.ok).toBe(true);
  expect(json.drafts).toEqual([]);
});
