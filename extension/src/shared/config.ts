import type { Settings, CaptureKind } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: "http://localhost:3101",
  baseUrls: ["http://localhost:3101"],
  apiKey: "",
  kinds: {
    mcq: { shortcut: "Alt+Shift+Q", marker: { shape: "circle", color: "#f59e0b" }, visible: true },
    flash: { shortcut: "Alt+Shift+F", marker: { shape: "square", color: "#3b82f6" }, visible: true },
    cloze: { shortcut: "Alt+Shift+C", marker: { shape: "triangle", color: "#a855f7" }, visible: true },
    "tf-sort": { shortcut: "Alt+Shift+T", marker: { shape: "diamond", color: "#10b981" }, visible: true },
    match: { shortcut: "Alt+Shift+M", marker: { shape: "star", color: "#ec4899" }, visible: true },
    multi: { shortcut: "Alt+Shift+A", marker: { shape: "circle", color: "#06b6d4" }, visible: true },
  },
};

export const CAPTURE_KINDS: CaptureKind[] = ["mcq", "multi", "flash", "cloze", "tf-sort", "match"];

export async function loadSettings(): Promise<Settings> {
  const stored = (await chrome.storage.sync.get("settings")).settings as Partial<Settings> | undefined;
  const activeUrl = stored?.baseUrl ?? DEFAULT_SETTINGS.baseUrl;
  const baseUrls = stored?.baseUrls ?? [activeUrl];
  
  return {
    baseUrl: activeUrl,
    baseUrls: baseUrls.includes(activeUrl) ? baseUrls : [activeUrl, ...baseUrls],
    apiKey: stored?.apiKey ?? DEFAULT_SETTINGS.apiKey,
    kinds: { ...DEFAULT_SETTINGS.kinds, ...(stored?.kinds ?? {}) },
  };
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.sync.set({ settings: s });
}

export function matchShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split("+").map((p) => p.trim());
  const need = {
    ctrl: parts.includes("ctrl"),
    alt: parts.includes("alt"),
    shift: parts.includes("shift"),
    meta: parts.includes("meta"),
  };
  const mainKey = parts[parts.length - 1];
  // Match on physical key (e.code, e.g. "KeyQ") as well as e.key: Alt/Shift can
  // change e.key to an accented char or dead key on some OS/keyboard layouts
  // (notably Windows), so e.key alone is unreliable. e.code is layout-stable.
  const key = (e.key ?? "").toLowerCase();
  const code = (e.code ?? "").toLowerCase();
  const keyMatches = key === mainKey || code === `key${mainKey}` || code === `digit${mainKey}`;
  return (
    Boolean(e.ctrlKey) === need.ctrl &&
    Boolean(e.altKey) === need.alt &&
    Boolean(e.shiftKey) === need.shift &&
    Boolean(e.metaKey) === need.meta &&
    keyMatches
  );
}
