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

async function init(): Promise<void> {
  const baseUrlInput = document.getElementById("baseUrl") as HTMLInputElement;
  const kindsContainer = document.getElementById("kinds") as HTMLElement;
  const saveAllBtn = document.getElementById("saveAll") as HTMLButtonElement;
  const status = document.getElementById("status") as HTMLElement;

  const settings = await loadSettings();
  baseUrlInput.value = settings.baseUrl || DEFAULT_SETTINGS.baseUrl;

  const rowInputs: Record<CaptureKind, { shortcut: HTMLInputElement; shape: HTMLSelectElement; color: HTMLInputElement; visible: HTMLInputElement; error: HTMLElement }> =
    {} as never;

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
  }

  saveAllBtn.addEventListener("click", () => {
    let hasError = false;
    const next: Settings = { baseUrl: baseUrlInput.value.trim() || DEFAULT_SETTINGS.baseUrl, kinds: { ...settings.kinds } };

    for (const kind of CAPTURE_KINDS) {
      const { shortcut, shape, color, visible, error } = rowInputs[kind];
      const others = CAPTURE_KINDS.filter((k) => k !== kind).map((k) => rowInputs[k].shortcut.value.trim());
      const err = validateShortcut(shortcut.value, others);
      error.textContent = err ?? "";
      if (err) hasError = true;
      next.kinds[kind] = {
        shortcut: shortcut.value.trim(),
        marker: { shape: shape.value as MarkerShape, color: color.value },
        visible: visible.checked,
      };
    }

    if (hasError) {
      status.textContent = "Fix the errors above before saving.";
      return;
    }

    void saveSettings(next).then(() => {
      status.textContent = "Saved ✓";
      setTimeout(() => (status.textContent = ""), 1500);
    });
  });
}

if (typeof document !== "undefined" && document.getElementById("kinds")) {
  void init();
}
