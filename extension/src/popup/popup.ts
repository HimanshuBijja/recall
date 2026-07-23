import { CAPTURE_KINDS, loadSettings, saveSettings } from "../shared/config";

async function init(): Promise<void> {
  const kindsContainer = document.getElementById("kinds") as HTMLElement;
  const openRecallBtn = document.getElementById("openRecall") as HTMLButtonElement;
  const openSettingsBtn = document.getElementById("openSettings") as HTMLButtonElement;

  const settings = await loadSettings();

  for (const kind of CAPTURE_KINDS) {
    const row = document.createElement("div");
    row.className = "kind-row";

    const name = document.createElement("span");
    name.className = "kind-name";
    name.textContent = kind;

    const capture = document.createElement("button");
    capture.textContent = "Capture";
    capture.className = "capture-btn";
    capture.title = `Capture a ${kind} card from the current video`;
    capture.addEventListener("click", () => {
      void (async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return;
        if (!/^https:\/\/www\.youtube\.com\//.test(tab.url ?? "")) {
          capture.textContent = "Open a youtube.com video";
          return;
        }
        const send = () => chrome.tabs.sendMessage(tab.id!, { type: "RUN_CAPTURE", kind });
        try {
          await send();
          window.close();
        } catch {
          // Content script not in this tab yet (tab predates the extension load)
          // — inject it on demand, then retry. The content script self-guards
          // against double-registration.
          try {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
            await send();
            window.close();
          } catch {
            capture.textContent = "Reload the video tab";
          }
        }
      })();
    });

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = settings.kinds[kind].visible;
    toggle.title = "Show markers of this kind on the timeline";
    toggle.addEventListener("change", () => {
      void (async () => {
        const latest = await loadSettings();
        latest.kinds[kind].visible = toggle.checked;
        await saveSettings(latest);
      })();
    });

    row.append(name, capture, toggle);
    kindsContainer.append(row);
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
