import { CAPTURE_KINDS } from "../shared/config";
import type { CaptureKind } from "../shared/types";

export interface QuestionConfig {
  count: number;
  kind: CaptureKind;
}

export const KIND_LABELS: Record<CaptureKind, string> = {
  mcq: "Multiple choice (1 answer)",
  multi: "Multiple choice (many answers)",
  flash: "Flashcard (front / back)",
  cloze: "Cloze deletion",
  "tf-sort": "True / False sort",
  match: "Match the pairs",
};

const HOST_ID = "recall-question-config-host";
const MAX_COUNT = 20;
const PREVIEW_CHARS = 160;

const modalStyles = `
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(24, 24, 24, 0.85);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .sheet {
    background: #181818;
    border: 1px solid #4A4441;
    border-radius: 4px;
    color: #EBDCC4;
    width: min(420px, 92vw);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #B6A596;
  }
  .selection-preview {
    font-size: 12px;
    line-height: 1.5;
    color: #B6A596;
    border-left: 2px solid #DC9F85;
    padding-left: 10px;
    max-height: 72px;
    overflow: hidden;
  }
  label {
    display: block;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #B6A596;
    margin-bottom: 6px;
  }
  input, select {
    width: 100%;
    box-sizing: border-box;
    background: #181818;
    border: 1px solid #4A4441;
    border-radius: 4px;
    color: #EBDCC4;
    padding: 8px 10px;
    font-size: 13px;
    font-family: inherit;
  }
  input:focus, select:focus { outline: none; border-color: #DC9F85; }
  .row { display: flex; gap: 12px; }
  .row > div:first-child { width: 96px; flex: 0 0 auto; }
  .row > div:last-child { flex: 1; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
  button {
    padding: 8px 14px;
    border-radius: 4px;
    border: 1px solid #4A4441;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor: pointer;
    font-family: inherit;
  }
  .cancel { background: transparent; color: #B6A596; }
  .generate { background: #DC9F85; color: #181818; border-color: #DC9F85; }
`;

export function openConfigModal(
  selectionPreview: string,
  initial: QuestionConfig = { count: 5, kind: "mcq" },
): Promise<QuestionConfig | null> {
  document.getElementById(HOST_ID)?.remove();

  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = modalStyles;

    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    backdrop.append(sheet);

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = "Add questions from selection";

    const preview = document.createElement("div");
    preview.className = "selection-preview";
    preview.textContent =
      selectionPreview.length > PREVIEW_CHARS ? `${selectionPreview.slice(0, PREVIEW_CHARS)}…` : selectionPreview;

    const row = document.createElement("div");
    row.className = "row";

    const countWrap = document.createElement("div");
    const countLabel = document.createElement("label");
    countLabel.textContent = "How many";
    countLabel.htmlFor = "recall-count";
    const countInput = document.createElement("input");
    countInput.id = "recall-count";
    countInput.type = "number";
    countInput.min = "1";
    countInput.max = String(MAX_COUNT);
    countInput.value = String(initial.count);
    countWrap.append(countLabel, countInput);

    const kindWrap = document.createElement("div");
    const kindLabel = document.createElement("label");
    kindLabel.textContent = "Question type";
    kindLabel.htmlFor = "recall-kind";
    const kindSelect = document.createElement("select");
    kindSelect.id = "recall-kind";
    for (const kind of CAPTURE_KINDS) {
      const opt = document.createElement("option");
      opt.value = kind;
      opt.textContent = KIND_LABELS[kind];
      opt.selected = kind === initial.kind;
      kindSelect.append(opt);
    }
    kindWrap.append(kindLabel, kindSelect);

    row.append(countWrap, kindWrap);

    const actions = document.createElement("div");
    actions.className = "actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "cancel";
    cancelBtn.textContent = "Cancel";
    const generateBtn = document.createElement("button");
    generateBtn.type = "button";
    generateBtn.className = "generate";
    generateBtn.textContent = "Generate";
    actions.append(cancelBtn, generateBtn);

    sheet.append(title, preview, row, actions);
    shadow.append(style, backdrop);

    function cleanup(): void {
      document.removeEventListener("keydown", onKeydown, true);
      host.remove();
    }

    function finish(result: QuestionConfig | null): void {
      cleanup();
      resolve(result);
    }

    function submit(): void {
      const raw = Math.floor(Number(countInput.value));
      const count = Number.isFinite(raw) ? Math.min(MAX_COUNT, Math.max(1, raw)) : 1;
      finish({ count, kind: kindSelect.value as CaptureKind });
    }

    function onKeydown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(null);
      } else if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    }

    cancelBtn.addEventListener("click", () => finish(null));
    generateBtn.addEventListener("click", submit);
    backdrop.addEventListener("mousedown", (e) => {
      if (e.target === backdrop) finish(null);
    });
    document.addEventListener("keydown", onKeydown, true);

    document.body.append(host);
    setTimeout(() => countInput.focus(), 0);
  });
}
