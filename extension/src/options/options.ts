import { DEFAULT_SETTINGS, loadSettings, saveSettings, CAPTURE_KINDS } from "../shared/config";
import type { CaptureKind, KindConfig, MarkerShape, Settings } from "../shared/types";

const RESERVED_COMBOS = new Set(["ctrl+b", "ctrl+shift+b"]);
const RESERVED_BARE_KEYS = new Set(["k", "j", "l", "f", "m"]);
const SHAPES: MarkerShape[] = ["circle", "square", "triangle", "diamond", "star"];

export function validateShortcut(shortcut: string, others: string[]): string | null {
  const trimmed = shortcut.trim();
  if (!trimmed) return "Shortcut cannot be empty";
  if (others.includes(trimmed)) return "This shortcut is already used by another kind";

  const parts = trimmed
    .toLowerCase()
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  const modifiers = parts.slice(0, -1);
  const normalized = parts.join("+");

  if (RESERVED_COMBOS.has(normalized)) return "This combo is reserved by the browser";
  if (modifiers.length === 0 && RESERVED_BARE_KEYS.has(parts[0])) {
    return "This key is reserved by YouTube's player shortcuts";
  }

  const hasAlt = modifiers.includes("alt");
  const hasCtrlShift = modifiers.includes("ctrl") && modifiers.includes("shift");
  if (!hasAlt && !hasCtrlShift) return "Shortcut needs a modifier (Alt or Ctrl+Shift)";

  return null;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

async function testConnection(url: string, apiKey: string): Promise<boolean> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 8000);
  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["X-API-Key"] = apiKey;
    }
    const res = await fetch(`${url}/api/tags`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(id);
    return res.status === 200 || res.status === 401 || res.status === 403;
  } catch {
    clearTimeout(id);
    return false;
  }
}

async function init(): Promise<void> {
  const newBaseUrlInput = document.getElementById("newBaseUrl") as HTMLInputElement;
  const addBaseUrlBtn = document.getElementById("addBaseUrl") as HTMLButtonElement;
  const baseUrlsList = document.getElementById("baseUrlsList") as HTMLElement;
  const apiKeyInput = document.getElementById("apiKey") as HTMLInputElement;
  const kindsContainer = document.getElementById("kinds") as HTMLElement;
  const saveAllBtn = document.getElementById("saveAll") as HTMLButtonElement;
  const status = document.getElementById("status") as HTMLElement;
  const syncNowBtn = document.getElementById("syncNow") as HTMLButtonElement;
  const syncStatus = document.getElementById("syncStatus") as HTMLElement;

  const settings = await loadSettings();
  apiKeyInput.value = settings.apiKey || "";

  let currentBaseUrls = settings.baseUrls || [settings.baseUrl];
  let currentActiveUrl = settings.baseUrl;

  const rowInputs: Record<CaptureKind, { shortcut: HTMLInputElement; shape: HTMLSelectElement; color: HTMLInputElement; visible: HTMLInputElement; error: HTMLElement }> =
    {} as never;

  const saveAll = async (): Promise<boolean> => {
    let hasError = false;
    const next: Settings = {
      baseUrl: currentActiveUrl,
      baseUrls: currentBaseUrls,
      apiKey: apiKeyInput.value.trim(),
      kinds: { ...settings.kinds },
    };

    if (Object.keys(rowInputs).length > 0) {
      for (const kind of CAPTURE_KINDS) {
        const { shortcut, shape, color, visible, error } = rowInputs[kind];
        const others = CAPTURE_KINDS.filter((k) => k !== kind).map((k) => rowInputs[k].shortcut.value.trim());
        const err = validateShortcut(shortcut.value, others);
        if (error) error.textContent = err ?? "";
        if (err) hasError = true;
        next.kinds[kind] = {
          shortcut: shortcut.value.trim(),
          marker: { shape: shape.value as MarkerShape, color: color.value },
          visible: visible.checked,
        };
      }
    }

    if (hasError) {
      status.textContent = "Fix the errors above before saving.";
      return false;
    }

    await saveSettings(next);
    status.textContent = "Saved ✓";
    setTimeout(() => (status.textContent = ""), 1500);
    return true;
  };

  const renderUrlsList = () => {
    baseUrlsList.innerHTML = "";
    currentBaseUrls.forEach((url) => {
      const row = el("div", { class: `url-row${url === currentActiveUrl ? " active" : ""}` });

      const info = el("div", { class: "url-info" });
      const text = el("span", { class: "url-text" });
      text.textContent = url;
      info.append(text);

      if (url === currentActiveUrl) {
        const badge = el("span", { class: "url-badge" });
        badge.textContent = "active";
        info.append(badge);
      }

      const actions = el("div", { class: "url-actions" });

      if (url !== currentActiveUrl) {
        const selectBtn = el("button", { class: "url-btn select-btn", type: "button" });
        selectBtn.textContent = "Select";
        selectBtn.addEventListener("click", async () => {
          currentActiveUrl = url;
          renderUrlsList();
          await saveAll();
          const ok = await testConnection(url, apiKeyInput.value.trim());
          if (ok) {
            alert(`Connection successful! Active server updated to: ${url}`);
          } else {
            alert(`Warning: Selected active server ${url} is unreachable.\nMake sure the local server is running or the deployed URL is correct.`);
          }
        });
        actions.append(selectBtn);
      }

      const testBtn = el("button", { class: "url-btn test-btn", type: "button" });
      testBtn.textContent = "Test";
      testBtn.addEventListener("click", async () => {
        testBtn.textContent = "Testing...";
        testBtn.disabled = true;
        const ok = await testConnection(url, apiKeyInput.value.trim());
        testBtn.textContent = "Test";
        testBtn.disabled = false;
        if (ok) {
          alert(`SUCCESS: Connected to ${url} successfully!`);
        } else {
          alert(`ERROR: Could not connect to ${url}.`);
        }
      });
      actions.append(testBtn);

      if (currentBaseUrls.length > 1) {
        const deleteBtn = el("button", { class: "url-btn delete-btn", type: "button" });
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", async () => {
          if (confirm(`Are you sure you want to delete ${url}?`)) {
            currentBaseUrls = currentBaseUrls.filter((u) => u !== url);
            if (currentActiveUrl === url) {
              currentActiveUrl = currentBaseUrls[0];
            }
            renderUrlsList();
            await saveAll();
          }
        });
        actions.append(deleteBtn);
      }

      row.append(info, actions);
      baseUrlsList.append(row);
    });
  };

  renderUrlsList();

  addBaseUrlBtn.addEventListener("click", async () => {
    const value = newBaseUrlInput.value.trim();
    if (!value) return;
    try {
      new URL(value);
    } catch {
      alert("Invalid URL format. Please enter a valid URL (e.g. http://localhost:3000)");
      return;
    }

    if (currentBaseUrls.includes(value)) {
      alert("This URL is already in your list.");
      return;
    }

    currentBaseUrls.push(value);
    newBaseUrlInput.value = "";
    renderUrlsList();
    await saveAll();
  });

  apiKeyInput.addEventListener("input", () => {
    void saveAll();
  });
  apiKeyInput.addEventListener("change", () => {
    void saveAll();
  });

  for (const kind of CAPTURE_KINDS) {
    const cfg: KindConfig = settings.kinds[kind];
    const row = el("div", { class: "kind-row" });

    const name = el("div", { class: "kind-name" });
    name.textContent = kind;

    const shortcutInput = el("input", { type: "text" }) as HTMLInputElement;
    shortcutInput.value = cfg.shortcut;

    const shapeSelect = el("select") as HTMLSelectElement;
    for (const shape of SHAPES) {
      const opt = el("option", { value: shape }) as HTMLOptionElement;
      opt.textContent = shape;
      opt.selected = shape === cfg.marker.shape;
      shapeSelect.append(opt);
    }

    const colorInput = el("input", { type: "color" }) as HTMLInputElement;
    colorInput.value = cfg.marker.color;

    const visibleInput = el("input", { type: "checkbox" }) as HTMLInputElement;
    visibleInput.checked = cfg.visible;

    row.append(name, shortcutInput, shapeSelect, colorInput, visibleInput);

    const errorEl = el("div", { class: "error" });
    errorEl.style.gridColumn = "1 / -1";

    kindsContainer.append(row, errorEl);
    rowInputs[kind] = { shortcut: shortcutInput, shape: shapeSelect, color: colorInput, visible: visibleInput, error: errorEl };

    [shortcutInput, shapeSelect, colorInput, visibleInput].forEach((el) => {
        el.addEventListener("input", () => void saveAll());
    });
  }

  saveAllBtn.addEventListener("click", () => {
    void saveAll();
  });

  syncNowBtn.addEventListener("click", async () => {
    syncStatus.textContent = "Syncing...";
    syncNowBtn.disabled = true;
    try {
      const response = (await chrome.runtime.sendMessage({ type: "SYNC_LOCAL_DB" })) as { success?: boolean; results?: Record<string, number>; error?: string } | undefined;
      if (response && response.success) {
        const results = response.results || {};
        const summary = Object.entries(results)
          .map(([name, count]) => `${name}: ${count}`)
          .join(", ");
        syncStatus.textContent = `Sync Complete! Mirrored ${summary}`;
      } else {
        syncStatus.textContent = `Sync Failed: ${response?.error || "Unknown error"}`;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      syncStatus.textContent = `Sync Failed: ${msg}`;
    } finally {
      syncNowBtn.disabled = false;
    }
  });
}

if (typeof document !== "undefined" && document.getElementById("kinds")) {
  void init();
}
