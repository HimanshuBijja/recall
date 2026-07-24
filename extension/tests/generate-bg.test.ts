import { expect, test, vi, beforeEach } from "vitest";

// Define mock global chrome before importing background.ts because the module
// setup calls chrome.runtime.onInstalled.addListener immediately.
const mockChrome = {
  storage: {
    sync: { get: async () => ({ settings: { baseUrl: "http://localhost:3000" } }), set: async () => {} },
    local: { get: async () => ({ queue: [] }), set: async () => {} },
  },
  alarms: { create: () => {}, clear: async () => {}, onAlarm: { addListener: () => {} } },
  runtime: {
    onMessage: { addListener: () => {} },
    onInstalled: { addListener: () => {} },
  },
  contextMenus: { create: () => {}, onClicked: { addListener: () => {} }, removeAll: (cb: () => void) => cb() },
  tabs: { sendMessage: async () => ({}) },
  scripting: { executeScript: async () => [] },
};
(globalThis as unknown as { chrome: unknown }).chrome = mockChrome;

import { buildGenerateUrl, handleMessage } from "../src/background";

beforeEach(() => {
  vi.restoreAllMocks();
  (globalThis as unknown as { chrome: unknown }).chrome = mockChrome;
});

test("buildGenerateUrl appends the generate path", () => {
  expect(buildGenerateUrl("http://localhost:3000")).toBe("http://localhost:3000/api/generate");
});

test("GENERATE_QUESTIONS posts to /api/generate and returns the drafts", async () => {
  const fetchMock = vi.fn(async () => new Response(
    JSON.stringify({ ok: true, drafts: [{ kind: "mcq", question: "Q", answer: "A", distractors: [], tags: [], explanation: "", hint: "" }] }),
    { status: 200 },
  ));
  vi.stubGlobal("fetch", fetchMock);

  const res = await handleMessage({
    type: "GENERATE_QUESTIONS",
    req: { text: "some text", kind: "mcq", count: 1, pageTitle: "T", pageUrl: "https://x.com" },
  }) as { ok: boolean; drafts: unknown[] };

  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/api/generate", expect.anything());
  expect(res.ok).toBe(true);
  expect(res.drafts).toHaveLength(1);
});

test("GENERATE_QUESTIONS surfaces the server error message on a non-2xx", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "quota exceeded" }), { status: 500 })));
  const res = await handleMessage({
    type: "GENERATE_QUESTIONS",
    req: { text: "t", kind: "mcq", count: 1 },
  }) as { ok: boolean; error: string };
  expect(res.ok).toBe(false);
  expect(res.error).toBe("quota exceeded");
});

test("SAVE_CARDS reports how many saved and how many queued", async () => {
  let call = 0;
  vi.stubGlobal("fetch", vi.fn(async () => {
    call += 1;
    return call === 2 ? new Response("nope", { status: 500 }) : new Response(JSON.stringify({ id: "x" }), { status: 201 });
  }));
  const res = await handleMessage({ type: "SAVE_CARDS", cards: [{ a: 1 }, { b: 2 }, { c: 3 }] }) as {
    saved: number; queued: number; failed: number;
  };
  expect(res.saved).toBe(2);
  expect(res.queued).toBe(1);
  expect(res.failed).toBe(0);
});
