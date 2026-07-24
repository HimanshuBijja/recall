import type { CardDraft, CaptureKind, MarkerShape } from "../../shared/types";
import { draftToCard, renderFields, type SourceMeta } from "./fields";
import { overlayStyles } from "./styles";
import { initAIEditor } from "./ai";

export interface OverlayOptions {
  kind: CaptureKind;
  draft: CardDraft;
  screenshotUrl?: string;
  marker?: { shape: MarkerShape; color: string };
  source: SourceMeta;
  frameDataUrl?: string;
  onRephrase?: () => Promise<CardDraft>;
}

export type OverlayResult = { action: "save"; card: Record<string, unknown> } | { action: "cancel" };

const HOST_ID = "recall-capture-overlay-host";

function removeExisting(): void {
  document.getElementById(HOST_ID)?.remove();
}

export async function openOverlay(opts: OverlayOptions): Promise<OverlayResult> {
  removeExisting();
  const allTags = (await chrome.runtime.sendMessage({ type: "GET_TAGS" }).catch(() => [])) as { id: string; name: string }[];

  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = overlayStyles;
    shadow.append(style);

    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    const card = document.createElement("div");
    card.className = "card";
    backdrop.append(card);
    shadow.append(backdrop);

    const headerRow = document.createElement("div");
    headerRow.className = "header-row";
    card.append(headerRow);

    const kindContainer = document.createElement("div");
    headerRow.append(kindContainer);

    const cols = document.createElement("div");
    cols.className = "columns";
    card.append(cols);

    const leftCol = document.createElement("div");
    leftCol.className = "left-col";
    const rightCol = document.createElement("div");
    rightCol.className = "right-col";
    cols.append(leftCol, rightCol);

    if (opts.frameDataUrl) {
      const img = document.createElement("img");
      img.className = "frame";
      img.src = opts.frameDataUrl;
      img.alt = "Captured frame";
      leftCol.append(img);
    } else {
      leftCol.style.display = "none";
    }

    const metaFieldsRoot = document.createElement("div");
    leftCol.append(metaFieldsRoot);

    const actions = document.createElement("div");
    actions.className = "actions";
    const aiBtn = document.createElement("button");
    aiBtn.className = "global-ai-btn";
    aiBtn.type = "button";
    aiBtn.title = "Ask AI to edit entire card";
    aiBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`;
    const undoBtn = document.createElement("button");
    undoBtn.className = "undo";
    undoBtn.type = "button";
    undoBtn.textContent = "Undo";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "cancel";
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    const saveBtn = document.createElement("button");
    saveBtn.className = "save";
    saveBtn.type = "button";
    saveBtn.textContent = "Save";
    actions.append(aiBtn, undoBtn, cancelBtn, saveBtn);
    headerRow.append(actions);

    const kindFieldsRoot = document.createElement("div");
    rightCol.append(kindFieldsRoot);

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = opts.kind;
    kindContainer.append(badge);

    let fields = renderFields(opts.kind, opts.draft, kindFieldsRoot, metaFieldsRoot, allTags);

    function cleanup(): void {
      document.removeEventListener("keydown", onKeydown, true);
      host.remove();
    }

    function doSave(): void {
      const values = fields.readValues();
      const built = draftToCard(values, opts.source, opts.screenshotUrl, opts.marker);
      cleanup();
      resolve({ action: "save", card: built });
    }

    function doCancel(): void {
      cleanup();
      resolve({ action: "cancel" });
    }

    undoBtn.addEventListener("click", () => {
      fields = renderFields(opts.kind, opts.draft, kindFieldsRoot, metaFieldsRoot, allTags);
    });

    cancelBtn.addEventListener("click", doCancel);
    saveBtn.addEventListener("click", doSave);

    // Initialize AI selections and global edits from modular module
    initAIEditor({
      shadow,
      card,
      backdrop,
      opts,
      allTags,
      kindFieldsRoot,
      metaFieldsRoot,
      aiBtn,
      getFields: () => fields,
      setFields: (newFields) => {
        fields = newFields;
      },
    });

    function onKeydown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        doCancel();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        doSave();
      }
    }
    document.addEventListener("keydown", onKeydown, true);

    document.body.append(host);
  });
}
