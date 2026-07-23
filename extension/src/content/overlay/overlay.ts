import type { CardDraft, CaptureKind, MarkerShape } from "../../shared/types";
import { draftToCard, renderFields, type SourceMeta } from "./fields";

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

export function openOverlay(opts: OverlayOptions): Promise<OverlayResult> {
  removeExisting();

  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      .backdrop { position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; font-family: Roboto, Arial, sans-serif; }
      .card { background:#1f1f1f; color:#f1f1f1; width:min(480px,92vw); max-height:88vh; overflow:auto; border-radius:12px; padding:16px; box-shadow:0 10px 40px rgba(0,0,0,.6); }
      .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:600; text-transform:uppercase; margin-bottom:8px; }
      img.frame { width:100%; border-radius:8px; margin-bottom:8px; }
      label { display:block; font-size:11px; opacity:.75; margin:8px 0 2px; }
      textarea, input { background:#2b2b2b; color:#f1f1f1; border:1px solid #3f3f3f; border-radius:6px; padding:6px; font-size:13px; }
      .actions { display:flex; gap:8px; margin-top:14px; justify-content:flex-end; }
      button { cursor:pointer; border:none; border-radius:6px; padding:6px 12px; font-size:13px; }
      .save { background:#3ea6ff; color:#000; font-weight:600; }
      .cancel { background:#3f3f3f; color:#f1f1f1; }
      .undo, .rephrase { background:#2b2b2b; color:#f1f1f1; border:1px solid #3f3f3f; }
    `;
    shadow.append(style);

    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    const card = document.createElement("div");
    card.className = "card";
    backdrop.append(card);
    shadow.append(backdrop);

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = opts.kind;
    badge.style.background = opts.marker?.color ?? "#3ea6ff";
    badge.style.color = "#0f0f0f";
    card.append(badge);

    if (opts.frameDataUrl) {
      const img = document.createElement("img");
      img.className = "frame";
      img.src = opts.frameDataUrl;
      img.alt = "Captured frame";
      card.append(img);
    }

    const fieldsRoot = document.createElement("div");
    card.append(fieldsRoot);

    let originalDraft = opts.draft;
    let fields = renderFields(opts.kind, originalDraft, fieldsRoot);

    const actions = document.createElement("div");
    actions.className = "actions";
    const undoBtn = document.createElement("button");
    undoBtn.className = "undo";
    undoBtn.type = "button";
    undoBtn.textContent = "Undo";
    const rephraseBtn = document.createElement("button");
    rephraseBtn.className = "rephrase";
    rephraseBtn.type = "button";
    rephraseBtn.textContent = "AI rephrase";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "cancel";
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    const saveBtn = document.createElement("button");
    saveBtn.className = "save";
    saveBtn.type = "button";
    saveBtn.textContent = "Save";
    actions.append(undoBtn, rephraseBtn, cancelBtn, saveBtn);
    card.append(actions);

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
      fields = renderFields(opts.kind, originalDraft, fieldsRoot);
      card.insertBefore(fieldsRoot, actions);
    });

    rephraseBtn.addEventListener("click", () => {
      if (!opts.onRephrase) return;
      rephraseBtn.disabled = true;
      rephraseBtn.textContent = "Rephrasing…";
      void opts.onRephrase().then((newDraft) => {
        originalDraft = newDraft;
        fields = renderFields(opts.kind, newDraft, fieldsRoot);
        rephraseBtn.disabled = false;
        rephraseBtn.textContent = "AI rephrase";
      });
    });

    cancelBtn.addEventListener("click", doCancel);
    saveBtn.addEventListener("click", doSave);

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
