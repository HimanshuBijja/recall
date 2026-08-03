import { loadSettings } from "./shared/config";
import type { CaptureRequest, CaptureResponse, GenerateRequest, GenerateResponse, SaveCardsResult } from "./shared/types";

const QUEUE_KEY = "queue";

export function buildCaptureUrl(baseUrl: string): string {
  return `${baseUrl}/api/capture`;
}

export function buildGenerateUrl(baseUrl: string): string {
  return `${baseUrl}/api/generate`;
}

export function buildCardsUrl(baseUrl: string): string {
  return `${baseUrl}/api/cards`;
}

export type BgMessage =
  | { type: "CAPTURE"; req: CaptureRequest }
  | { type: "SAVE_CARD"; card: unknown }
  | { type: "GET_MARKERS"; videoId: string }
  | { type: "GET_TAGS" }
  | { type: "EDIT_TEXT"; selection?: string; prompt: string; draft?: unknown }
  | { type: "GENERATE_QUESTIONS"; req: GenerateRequest }
  | { type: "SAVE_CARDS"; cards: unknown[]; groupName?: string }
  | { type: "SYNC_LOCAL_DB" }
  | { type: "UPLOAD_IMAGE"; fileDataUrl: string };

export type BgResponse =
  | CaptureResponse
  | { ok: true; card: unknown }
  | { ok: false; queued: true }
  | { ok: false; error: string }
  | unknown[]
  | GenerateResponse
  | SaveCardsResult;

async function baseUrl(): Promise<string> {
  const settings = await loadSettings();
  return settings.baseUrl;
}

async function fetchWithAuth(url: string, init?: RequestInit): Promise<Response> {
  const settings = await loadSettings();
  const headers = new Headers(init?.headers);
  if (settings.apiKey) {
    headers.set("X-API-Key", settings.apiKey);
  }
  return fetch(url, {
    ...init,
    headers,
  });
}

async function postCard(base: string, card: unknown): Promise<{ ok: boolean; card?: unknown }> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetchWithAuth(buildCardsUrl(base), {
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
      const res = await fetchWithAuth(buildCaptureUrl(base), {
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
      const res = await fetchWithAuth(`${buildCardsUrl(base)}?videoId=${encodeURIComponent(msg.videoId)}`, {
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
      const res = await fetchWithAuth(`${base}/api/tags`, {
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
      const res = await fetchWithAuth(`${base}/api/edit`, {
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

  if (msg.type === "GENERATE_QUESTIONS") {
    const controller = new AbortController();
    // Generating N cards takes materially longer than a single capture.
    const id = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetchWithAuth(buildGenerateUrl(base), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg.req),
        signal: controller.signal,
      });
      clearTimeout(id);
      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: errJson.error || `generation failed (${res.status})` };
      }
      return (await res.json()) as GenerateResponse;
    } catch (e) {
      clearTimeout(id);
      const isAbort = e instanceof Error && e.name === "AbortError";
      return {
        ok: false,
        error: isAbort ? "AI request timed out (60s)" : e instanceof Error ? e.message : "generation failed",
      };
    }
  }

  if (msg.type === "SAVE_CARDS") {
    let saved = 0;
    let queued = 0;
    for (const card of msg.cards) {
      const payload = msg.groupName && typeof card === "object" && card !== null
        ? { ...(card as Record<string, unknown>), groupName: msg.groupName }
        : card;
      const result = await postCard(base, payload);
      if (result.ok) {
        saved += 1;
      } else {
        await enqueue(payload);
        queued += 1;
      }
    }
    return { saved, queued, failed: 0 };
  }

  if (msg.type === "SYNC_LOCAL_DB") {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetchWithAuth(`${base}/api/sync/local`, {
        method: "POST",
        signal: controller.signal,
      });
      clearTimeout(id);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return { ok: false, error: errJson.error || `Sync failed (${res.status})` };
      }
      return await res.json();
    } catch (e) {
      clearTimeout(id);
      return { ok: false, error: e instanceof Error ? e.message : "Sync failed" };
    }
  }

  if (msg.type === "UPLOAD_IMAGE") {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetchWithAuth(`${base}/api/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileDataUrl: msg.fileDataUrl }),
        signal: controller.signal,
      });
      clearTimeout(id);
      if (!res.ok) {
        return { ok: false, error: `Upload failed (${res.status})` };
      }
      return await res.json();
    } catch (e) {
      clearTimeout(id);
      return { ok: false, error: e instanceof Error ? e.message : "Upload failed" };
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

const MENU_ID = "recall-add-question";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Add question",
      contexts: ["selection"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  const tabId = tab.id;
  // The always-on content script is not present in tabs that were already
  // open when the extension installed or reloaded — inject it, then retry.
  void chrome.tabs.sendMessage(tabId, { type: "OPEN_QUESTION_MODAL" }).catch(async () => {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["web.js"] });
    await chrome.tabs.sendMessage(tabId, { type: "OPEN_QUESTION_MODAL" });
  });
});
