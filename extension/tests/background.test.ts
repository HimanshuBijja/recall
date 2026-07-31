import { expect, test, vi, beforeEach } from "vitest";
import { buildCaptureUrl, buildCardsUrl, handleMessage } from "../src/background";

beforeEach(() => {
  vi.restoreAllMocks();
});

test("buildCaptureUrl joins base + path", () => {
  expect(buildCaptureUrl("http://localhost:3000")).toBe("http://localhost:3000/api/capture");
});

test("buildCardsUrl joins base + path", () => {
  expect(buildCardsUrl("http://localhost:3000")).toBe("http://localhost:3000/api/cards");
});

test("SAVE_CARD queues when fetch fails", async () => {
  const store: Record<string, unknown> = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async () => ({ queue: store.queue ?? [] }),
        set: async (o: Record<string, unknown>) => Object.assign(store, o),
      },
      sync: { get: async () => ({ settings: undefined }) },
    },
    alarms: { create: () => {}, onAlarm: { addListener: () => {} }, clear: async () => {} },
    runtime: { onMessage: { addListener: () => {} } },
  } as never;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("offline");
    }),
  );
  const res = await handleMessage({ type: "SAVE_CARD", card: { kind: "flash", question: "Q", answer: "A" } });
  expect(res).toEqual({ ok: false, queued: true });
  expect((store.queue as unknown[]).length).toBe(1);
});

test("SAVE_CARD succeeds when fetch resolves ok", async () => {
  const store: Record<string, unknown> = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async () => ({ queue: store.queue ?? [] }),
        set: async (o: Record<string, unknown>) => Object.assign(store, o),
      },
      sync: { get: async () => ({ settings: undefined }) },
    },
    alarms: { create: () => {}, onAlarm: { addListener: () => {} }, clear: async () => {} },
    runtime: { onMessage: { addListener: () => {} } },
  } as never;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ id: "1" }) })));
  const res = await handleMessage({ type: "SAVE_CARD", card: { kind: "flash", question: "Q", answer: "A" } });
  expect(res).toEqual({ ok: true, card: { id: "1" } });
});

test("CAPTURE forwards to /api/capture and returns response body", async () => {
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: { sync: { get: async () => ({ settings: undefined }) } },
    alarms: { create: () => {}, onAlarm: { addListener: () => {} }, clear: async () => {} },
    runtime: { onMessage: { addListener: () => {} } },
  } as never;
  const draft = { ok: true, draft: { kind: "mcq" } };
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => draft }));
  vi.stubGlobal("fetch", fetchMock);
  const res = await handleMessage({
    type: "CAPTURE",
    req: { kind: "mcq", videoId: "abc", url: "u", title: "t", channel: "c", timestamp: 1, frameDataUrl: "data:x" },
  });
  expect(res).toEqual(draft);
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3101/api/capture",
    expect.objectContaining({ method: "POST" }),
  );
});
