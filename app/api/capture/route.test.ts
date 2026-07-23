import { expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/gemini", () => ({
  draftCardFromFrame: vi.fn(async () => ({
    draft: { kind: "mcq", question: "Q", answer: "A", distractors: ["b","c","d"], tags: ["t"], explanation: "", hint: "" },
    ocrText: "raw text",
  })),
}));
vi.mock("@/lib/storage", () => ({ uploadFrame: vi.fn(async () => "https://r2/frame.png") }));

import { POST } from "@/app/api/capture/route";

function req(body: unknown) {
  return new Request("http://localhost/api/capture", { method: "POST", body: JSON.stringify(body) }) as never;
}

beforeEach(() => vi.clearAllMocks());

test("returns a draft, screenshot url, and kind marker", async () => {
  const res = await POST(req({
    kind: "mcq", videoId: "abc", url: "u", title: "t", channel: "c",
    timestamp: 5, frameDataUrl: "data:image/png;base64,AAAA",
  }));
  const json = await res.json();
  expect(res.status).toBe(200);
  expect(json.ok).toBe(true);
  expect(json.draft.answer).toBe("A");
  expect(json.screenshotUrl).toBe("https://r2/frame.png");
  expect(json.marker).toEqual({ shape: "circle", color: "#f59e0b" });
});

test("400 on missing frame", async () => {
  const res = await POST(req({ kind: "mcq", videoId: "abc", url: "u", title: "t", channel: "c", timestamp: 5 }));
  expect(res.status).toBe(400);
});
