import { loadSettings, matchShortcut, CAPTURE_KINDS, DEFAULT_SETTINGS } from "../shared/config";
import type { CaptureKind, CardDraft, MarkerRow, Settings, CaptureRequest, CaptureResponse } from "../shared/types";
import { getPageMeta, extractVideoId } from "./metadata";
import { captureFrame, getPlayerVideo } from "./capture";
import { renderMarkers } from "./markers";
import { openOverlay } from "./overlay/overlay";
import { showToast } from "./toast";

let settings: Settings | null = null;

async function currentSettings(): Promise<Settings> {
  if (!settings) settings = await loadSettings();
  return settings;
}

async function refreshMarkers(): Promise<void> {
  const videoId = extractVideoId(location.href);
  const video = getPlayerVideo();
  const bar = document.querySelector<HTMLElement>(".ytp-progress-bar");
  if (!videoId || !video || !bar) return;
  const s = await currentSettings();
  const rows = (await chrome.runtime.sendMessage({ type: "GET_MARKERS", videoId })) as MarkerRow[];
  const paint = () =>
    renderMarkers(bar, Array.isArray(rows) ? rows : [], video.duration, s, (t) => {
      video.currentTime = t;
    });
  if (Number.isFinite(video.duration) && video.duration > 0) {
    paint();
  } else {
    video.addEventListener("loadedmetadata", paint, { once: true });
  }
}

async function requestDraft(req: CaptureRequest): Promise<CaptureResponse> {
  return (await chrome.runtime.sendMessage({ type: "CAPTURE", req })) as CaptureResponse;
}

async function runCapture(kind: CaptureKind): Promise<void> {
  const meta = getPageMeta(location, document);
  const video = getPlayerVideo();
  if (!meta || !video) {
    showToast("Not on a video page", true);
    return;
  }
  let frameDataUrl: string;
  try {
    frameDataUrl = captureFrame(video);
  } catch {
    showToast("Couldn't capture frame", true);
    return;
  }
  const timestamp = video.currentTime;
  video.pause();

  const s = await currentSettings();
  const req: CaptureRequest = {
    kind,
    videoId: meta.videoId,
    url: meta.url,
    title: meta.title,
    channel: meta.channel,
    timestamp,
    frameDataUrl,
  };

  const res = await requestDraft(req);
  if (!res.ok || !res.draft) {
    showToast(res.error ?? "Draft failed", true);
    return;
  }

  const source = { videoId: meta.videoId, url: meta.url, timestamp, channel: meta.channel, title: meta.title };
  const result = await openOverlay({
    kind,
    draft: res.draft,
    screenshotUrl: res.screenshotUrl,
    marker: res.marker ?? s.kinds[kind].marker,
    source,
    frameDataUrl,
    onRephrase: async (): Promise<CardDraft> => {
      const rephrased = await requestDraft(req);
      return rephrased.draft ?? res.draft!;
    },
  });

  if (result.action === "save") {
    const saveRes = (await chrome.runtime.sendMessage({ type: "SAVE_CARD", card: result.card })) as
      | { ok: true; card: unknown }
      | { ok: false; queued: true }
      | { ok: false; error: string };
    if (saveRes.ok) {
      showToast(`✓ Saved ${kind}`);
      void refreshMarkers();
    } else if ("queued" in saveRes && saveRes.queued) {
      showToast("Server offline — queued", true);
    } else {
      showToast("Save failed", true);
    }
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)
  );
}

// Guard so the popup can re-inject this script (chrome.scripting) into a tab
// that was open before the extension loaded, without double-registering.
const w = window as unknown as { __recallLoaded?: boolean };
if (!w.__recallLoaded) {
  w.__recallLoaded = true;

window.addEventListener(
  "keydown",
  (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    // Match synchronously so preventDefault lands in time. Use cached settings
    // (falls back to defaults until the first async load resolves).
    const kinds = (settings ?? DEFAULT_SETTINGS).kinds;
    // Diagnostic: log any Alt/Ctrl+Shift combo so we can see what the browser
    // actually delivers (helps when an OS shortcut, e.g. Windows Alt+Shift
    // language switch, mangles or swallows the key).
    if (e.altKey || (e.ctrlKey && e.shiftKey)) {
      console.debug("[Recall] keydown", { key: e.key, code: e.code, alt: e.altKey, shift: e.shiftKey, ctrl: e.ctrlKey });
    }
    for (const kind of CAPTURE_KINDS) {
      if (matchShortcut(e, kinds[kind].shortcut)) {
        e.preventDefault();
        e.stopPropagation();
        console.info(`[Recall] capturing ${kind} (${kinds[kind].shortcut})`);
        void runCapture(kind);
        return;
      }
    }
  },
  true,
);

// Popup / other extension surfaces can trigger a capture directly, bypassing
// the OS-level hotkey entirely (useful when Alt+Shift is eaten by the OS).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "PING") {
    sendResponse({ ok: true, href: location.href });
    return true;
  }
  if (msg?.type === "RUN_CAPTURE" && msg.kind) {
    void runCapture(msg.kind as CaptureKind);
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.settings) {
    settings = null;
    void currentSettings();
  }
});

// Visible proof the content script is actually injected (no console needed).
function showLoadBanner(): void {
  const b = document.createElement("div");
  b.textContent = "✓ Recall Capture active";
  b.style.cssText = [
    "position:fixed", "top:12px", "left:50%", "transform:translateX(-50%)",
    "z-index:2147483647", "padding:8px 16px", "border-radius:8px",
    "background:#16a34a", "color:#fff", "font:600 13px/1.2 Roboto,Arial,sans-serif",
    "box-shadow:0 4px 14px rgba(0,0,0,.4)", "pointer-events:none",
  ].join(";");
  (document.body ?? document.documentElement).appendChild(b);
  setTimeout(() => b.remove(), 4000);
}

// YouTube is an SPA — re-render on internal navigation.
window.addEventListener("yt-navigate-finish", () => {
  setTimeout(() => void refreshMarkers(), 1000);
});

void currentSettings(); // eager-load so the first keypress has real settings
setTimeout(() => void refreshMarkers(), 1500); // initial load
showLoadBanner();
console.info("[Recall] capture content script loaded on", location.href);

}
