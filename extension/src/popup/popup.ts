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

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = settings.kinds[kind].visible;
    toggle.addEventListener("change", () => {
      void (async () => {
        const latest = await loadSettings();
        latest.kinds[kind].visible = toggle.checked;
        await saveSettings(latest);
      })();
    });

    row.append(name, toggle);
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
