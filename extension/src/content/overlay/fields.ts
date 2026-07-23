import type { CardDraft, CaptureKind, MarkerShape } from "../../shared/types";

export interface SourceMeta {
  videoId: string;
  url: string;
  timestamp: number;
  channel?: string;
  title?: string;
}

export function draftToCard(
  draft: CardDraft,
  source: SourceMeta,
  screenshotUrl?: string,
  marker?: { shape: MarkerShape; color: string },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    kind: draft.kind,
    question: draft.question,
    answer: draft.answer,
    distractors: draft.distractors,
    explanation: draft.explanation,
    hint: draft.hint,
    tags: draft.tags,
    source: {
      ...source,
      ...(screenshotUrl ? { screenshotUrl } : {}),
      ...(marker ? { marker } : {}),
    },
  };
  if (draft.kind === "cloze") body.question = draft.clozeText ?? "";
  if (draft.kind === "tf-sort") body.statements = draft.statements ?? [];
  if (draft.kind === "match") body.pairs = draft.pairs ?? [];
  return body;
}

export interface FieldsRoot {
  readValues(): CardDraft;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

function textarea(value: string, placeholder: string): HTMLTextAreaElement {
  const t = el("textarea", { placeholder, rows: "2", style: "width:100%;box-sizing:border-box;" });
  t.value = value;
  return t;
}

function input(value: string, placeholder: string): HTMLInputElement {
  const i = el("input", { type: "text", placeholder, style: "width:100%;box-sizing:border-box;" });
  i.value = value;
  return i;
}

export function renderFields(kind: CaptureKind, draft: CardDraft, root: HTMLElement): FieldsRoot {
  root.innerHTML = "";

  const questionField = textarea(kind === "cloze" ? (draft.clozeText ?? "") : draft.question, "Question");
  root.append(el("label", {}, ["Question"]), questionField);
  if (kind === "cloze") {
    root.append(el("div", { style: "font-size:11px;opacity:.7;" }, ["Use ==answer== for blanks"]));
  }

  // --- kind-specific body ---
  let answerField: HTMLInputElement | null = null;
  const distractorFields: HTMLInputElement[] = [];
  let statementRows: { textInput: HTMLInputElement; trueBtn: HTMLButtonElement; isTrue: boolean }[] = [];
  let pairRows: { leftInput: HTMLInputElement; rightInput: HTMLInputElement }[] = [];
  let statementsContainer: HTMLElement | null = null;
  let pairsContainer: HTMLElement | null = null;

  if (kind === "mcq") {
    answerField = input(draft.answer, "Correct answer");
    root.append(el("label", {}, ["Answer"]), answerField);
    for (let i = 0; i < 3; i++) {
      const df = input(draft.distractors[i] ?? "", `Distractor ${i + 1}`);
      distractorFields.push(df);
      root.append(df);
    }
  } else if (kind === "flash") {
    answerField = input(draft.answer, "Back");
    root.append(el("label", {}, ["Answer (back)"]), answerField);
  } else if (kind === "tf-sort") {
    statementsContainer = el("div", { class: "recall-statements" });
    const addRow = (text: string, isTrue: boolean) => {
      const textInput = input(text, "Statement");
      const trueBtn = el("button", { type: "button" }, [isTrue ? "T" : "F"]);
      const row = { textInput, trueBtn, isTrue };
      trueBtn.addEventListener("click", () => {
        row.isTrue = !row.isTrue;
        trueBtn.textContent = row.isTrue ? "T" : "F";
      });
      const removeBtn = el("button", { type: "button" }, ["✕"]);
      const rowEl = el("div", { style: "display:flex;gap:4px;align-items:center;" }, [
        trueBtn,
        textInput,
        removeBtn,
      ]);
      removeBtn.addEventListener("click", () => {
        statementRows = statementRows.filter((r) => r !== row);
        rowEl.remove();
      });
      statementRows.push(row);
      statementsContainer!.append(rowEl);
    };
    for (const s of draft.statements ?? []) addRow(s.text, s.isTrue);
    if ((draft.statements ?? []).length === 0) addRow("", true);
    const addBtn = el("button", { type: "button" }, ["+ Add statement"]);
    addBtn.addEventListener("click", () => addRow("", true));
    root.append(el("label", {}, ["Statements"]), statementsContainer, addBtn);
  } else if (kind === "match") {
    pairsContainer = el("div", { class: "recall-pairs" });
    const addRow = (left: string, right: string) => {
      const leftInput = input(left, "Left");
      const rightInput = input(right, "Right");
      const row = { leftInput, rightInput };
      const removeBtn = el("button", { type: "button" }, ["✕"]);
      const rowEl = el("div", { style: "display:flex;gap:4px;align-items:center;" }, [
        leftInput,
        rightInput,
        removeBtn,
      ]);
      removeBtn.addEventListener("click", () => {
        pairRows = pairRows.filter((r) => r !== row);
        rowEl.remove();
      });
      pairRows.push(row);
      pairsContainer!.append(rowEl);
    };
    for (const p of draft.pairs ?? []) addRow(p.left, p.right);
    if ((draft.pairs ?? []).length === 0) addRow("", "");
    const addBtn = el("button", { type: "button" }, ["+ Add pair"]);
    addBtn.addEventListener("click", () => addRow("", ""));
    root.append(el("label", {}, ["Pairs"]), pairsContainer, addBtn);
  }

  const tagsField = input(draft.tags.join(", "), "tags, comma, separated");
  root.append(el("label", {}, ["Tags"]), tagsField);
  const explanationField = textarea(draft.explanation, "Explanation");
  root.append(el("label", {}, ["Explanation"]), explanationField);
  const hintField = textarea(draft.hint, "Hint");
  root.append(el("label", {}, ["Hint"]), hintField);

  return {
    readValues(): CardDraft {
      const tags = tagsField.value
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      const base: CardDraft = {
        kind,
        question: kind === "cloze" ? "" : questionField.value,
        answer: answerField?.value ?? "",
        distractors: distractorFields.map((d) => d.value),
        tags,
        explanation: explanationField.value,
        hint: hintField.value,
      };
      if (kind === "cloze") base.clozeText = questionField.value;
      if (kind === "tf-sort") {
        base.statements = statementRows.map((r) => ({ text: r.textInput.value, isTrue: r.isTrue }));
      }
      if (kind === "match") {
        base.pairs = pairRows.map((r) => ({ left: r.leftInput.value, right: r.rightInput.value }));
      }
      return base;
    },
  };
}
