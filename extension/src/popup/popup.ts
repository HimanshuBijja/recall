import { CAPTURE_KINDS, loadSettings, saveSettings } from "../shared/config";
import type { CaptureKind } from "../shared/types";

const KIND_DESCS: Record<CaptureKind, string> = {
  mcq: "Multiple choice (1 answer)",
  multi: "Multiple choice (multi answers)",
  flash: "Flashcard (front/back)",
  cloze: "Cloze deletion blanks",
  "tf-sort": "True/False statements",
  match: "Pair matching game",
};

async function init(): Promise<void> {
  const kindsContainer = document.getElementById("kinds") as HTMLElement;
  const openRecallBtn = document.getElementById("openRecall") as HTMLButtonElement;
  const openSettingsBtn = document.getElementById("openSettings") as HTMLButtonElement;

  const settings = await loadSettings();

  for (const kind of CAPTURE_KINDS) {
    const row = document.createElement("div");
    row.className = "kind-row";

    const info = document.createElement("div");
    info.className = "kind-info";

    const name = document.createElement("span");
    name.className = "kind-name";
    name.textContent = kind === "tf-sort" ? "True / False" : kind;

    const desc = document.createElement("span");
    desc.className = "kind-desc";
    desc.textContent = KIND_DESCS[kind] ?? "";

    info.append(name, desc);

    const capture = document.createElement("button");
    capture.textContent = "Capture";
    capture.className = "capture-btn";
    capture.title = `Capture a ${kind} card from the current video`;
    capture.addEventListener("click", () => {
      void (async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return;
        if (!/^https:\/\/www\.youtube\.com\//.test(tab.url ?? "")) {
          capture.textContent = "Open YouTube video";
          return;
        }
        const send = () => chrome.tabs.sendMessage(tab.id!, { type: "RUN_CAPTURE", kind });
        try {
          await send();
          window.close();
        } catch {
          try {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
            await send();
            window.close();
          } catch {
            capture.textContent = "Reload tab";
          }
        }
      })();
    });

    const toggleLabel = document.createElement("label");
    toggleLabel.className = "toggle-label";
    toggleLabel.title = "Show markers of this kind on the timeline";

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = settings.kinds[kind]?.visible ?? true;
    toggle.addEventListener("change", () => {
      void (async () => {
        const latest = await loadSettings();
        if (!latest.kinds[kind]) {
          latest.kinds[kind] = { shortcut: "", marker: { shape: "circle", color: "#6366f1" }, visible: true };
        }
        latest.kinds[kind].visible = toggle.checked;
        await saveSettings(latest);
      })();
    });

    const slider = document.createElement("span");
    slider.className = "slider";

    toggleLabel.append(toggle, slider);

    row.append(info, capture, toggleLabel);
    kindsContainer.append(row);
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    const m = /youtube\.com\/watch\?(?:.*&)?v=([^&]+)/.exec(tab.url);
    if (m) {
      const videoId = m[1];
      const attemptBtn = document.getElementById("attemptVideo") as HTMLButtonElement;
      if (attemptBtn) {
        attemptBtn.style.display = "block";
        attemptBtn.addEventListener("click", () => {
          void chrome.tabs.create({
            url: `${settings.baseUrl}/test/session?videoId=${encodeURIComponent(videoId)}`,
          });
        });
      }
    }
  }

  openRecallBtn.addEventListener("click", () => {
    void chrome.tabs.create({ url: settings.baseUrl });
  });

  openSettingsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

if (typeof document !== "undefined" && document.getElementById("kinds")) {
  void init();
}
