import { loadSettings } from "./shared/config";
import type { CaptureRequest, CaptureResponse } from "./shared/types";

const QUEUE_KEY = "queue";

export function buildCaptureUrl(baseUrl: string): string {
  return `${baseUrl}/api/capture`;
}

export function buildCardsUrl(baseUrl: string): string {
  return `${baseUrl}/api/cards`;
}

export type BgMessage =
  | { type: "CAPTURE"; req: CaptureRequest }
  | { type: "SAVE_CARD"; card: unknown }
  | { type: "GET_MARKERS"; videoId: string }
  | { type: "GET_TAGS" }
  | { type: "EDIT_TEXT"; selection?: string; prompt: string; draft?: unknown };

export type BgResponse =
  | CaptureResponse
  | { ok: true; card: unknown }
  | { ok: false; queued: true }
  | { ok: false; error: string }
  | unknown[];

async function baseUrl(): Promise<string> {
  const settings = await loadSettings();
  return settings.baseUrl;
}

async function postCard(base: string, card: unknown): Promise<{ ok: boolean; card?: unknown }> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(buildCardsUrl(base), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
      signal: controller.signal,
    });
    clearTimeout(id);
    if (!res.ok) return { ok: false };
    return { ok: true, card: await res.json() };
  } catch {
    clearTimeout(id);
    return { ok: false };
  }
}

async function enqueue(card: unknown): Promise<void> {
  const { [QUEUE_KEY]: q = [] } = await chrome.storage.local.get(QUEUE_KEY);
  await chrome.storage.local.set({ [QUEUE_KEY]: [...(q as unknown[]), card] });
  chrome.alarms.create("flush-queue", { periodInMinutes: 1 });
}

export async function flushQueue(): Promise<void> {
  const { [QUEUE_KEY]: q = [] } = await chrome.storage.local.get(QUEUE_KEY);
  const pending = q as unknown[];
  if (pending.length === 0) {
    await chrome.alarms.clear("flush-queue");
    return;
  }
  const base = await baseUrl();
  const remaining: unknown[] = [];
  for (const card of pending) {
    const res = await postCard(base, card);
    if (!res.ok) remaining.push(card);
  }
  await chrome.storage.local.set({ [QUEUE_KEY]: remaining });
  if (remaining.length === 0) {
    await chrome.alarms.clear("flush-queue");
  }
}

export async function handleMessage(msg: BgMessage): Promise<BgResponse> {
  const base = await baseUrl();

  if (msg.type === "CAPTURE") {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 25000); // 25s timeout for AI generation
    try {
      const res = await fetch(buildCaptureUrl(base), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg.req),
        signal: controller.signal,
      });
      clearTimeout(id);
      if (!res.ok) return { ok: false, error: `capture failed (${res.status})` };
      return (await res.json()) as CaptureResponse;
    } catch (e) {
      clearTimeout(id);
      const isAbort = e instanceof Error && e.name === "AbortError";
      return {
        ok: false,
        error: isAbort ? "AI request timed out (25s)" : (e instanceof Error ? e.message : "capture failed")
      };
    }
  }

  if (msg.type === "SAVE_CARD") {
    const result = await postCard(base, msg.card);
    if (!result.ok) {
      await enqueue(msg.card);
      return { ok: false, queued: true };
    }
    return { ok: true, card: result.card };
  }

  if (msg.type === "GET_MARKERS") {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${buildCardsUrl(base)}?videoId=${encodeURIComponent(msg.videoId)}`, {
        signal: controller.signal,
      });
      clearTimeout(id);
      if (!res.ok) return [];
      return (await res.json()) as unknown[];
    } catch {
      clearTimeout(id);
      return [];
    }
  }

  if (msg.type === "GET_TAGS") {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${base}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(id);
      if (!res.ok) return [];
      return (await res.json()) as unknown[];
    } catch {
      clearTimeout(id);
      return [];
    }
  }

  if (msg.type === "EDIT_TEXT") {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${base}/api/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection: msg.selection, prompt: msg.prompt, draft: msg.draft }),
        signal: controller.signal,
      });
      clearTimeout(id);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return { ok: false, error: errJson.error || `Request failed (${res.status})` };
      }
      return await res.json();
    } catch (e) {
      clearTimeout(id);
      return { ok: false, error: e instanceof Error ? e.message : "Request failed" };
    }
  }

  return { ok: false, error: "unknown message" };
}

chrome.runtime.onMessage.addListener((msg: BgMessage, _sender, sendResponse) => {
  handleMessage(msg)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  return true; // async response
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "flush-queue") {
    void flushQueue();
  }
});
