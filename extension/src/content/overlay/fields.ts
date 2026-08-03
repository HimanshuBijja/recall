import type { CardDraft, CaptureKind, MarkerShape, WebSourceMeta } from "../../shared/types";

export interface VideoSourceMeta {
  videoId: string;
  url: string;
  timestamp: number;
  channel?: string;
  title?: string;
}

export type SourceMeta = VideoSourceMeta | WebSourceMeta;

function isWebSourceMeta(s: SourceMeta): s is WebSourceMeta {
  return "type" in s && s.type === "web";
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
    source: isWebSourceMeta(source)
      ? { ...source }
      : {
          ...source,
          ...(screenshotUrl ? { screenshotUrl } : {}),
          ...(marker ? { marker } : {}),
        },
  };
  if (draft.kind === "cloze") body.clozeText = draft.clozeText ?? "";
  if (draft.kind === "tf-sort") body.statements = draft.statements ?? [];
  if (draft.kind === "match") body.pairs = draft.pairs ?? [];
  if (draft.kind === "multi") body.answers = draft.answers ?? [];
  if (draft.referenceImages && draft.referenceImages.length > 0) {
    body.referenceImages = draft.referenceImages;
  }
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
  const t = el("textarea", { placeholder, rows: "2", style: "width:100%;box-sizing:border-box;resize:none;overflow-y:hidden;" });
  t.value = value;
  const adjust = () => {
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight + 4}px`;
  };
  t.addEventListener("input", adjust);
  t.addEventListener("keydown", (e) => {
    e.stopPropagation();
  });
  setTimeout(adjust, 0);
  return t;
}

function input(value: string, placeholder: string): HTMLInputElement {
  const i = el("input", { type: "text", placeholder, style: "width:100%;box-sizing:border-box;" });
  i.value = value;
  i.addEventListener("keydown", (e) => {
    e.stopPropagation();
  });
  return i;
}

export type OptionsLayout = "rows" | "table";

export function renderFields(
  kind: CaptureKind,
  draft: CardDraft,
  kindRoot: HTMLElement,
  metaRoot: HTMLElement,
  allTags: { id: string; name: string }[] = [],
  optionsLayout: OptionsLayout = "rows",
): FieldsRoot {
  kindRoot.innerHTML = "";
  metaRoot.innerHTML = "";

  const questionField = textarea(kind === "cloze" ? (draft.clozeText ?? "") : draft.question, "Question");
  questionField.setAttribute("data-field", "question");
  kindRoot.append(el("label", {}, ["Question"]), questionField);
  if (kind === "cloze") {
    kindRoot.append(el("div", { style: "font-size:11px;opacity:.7;" }, ["Use ==answer== for blanks"]));
  }

  // --- kind-specific body ---
  let answerField: HTMLInputElement | HTMLTextAreaElement | null = null;
  const distractorFields: HTMLInputElement[] = [];
  let statementRows: { textInput: HTMLInputElement; trueBtn: HTMLButtonElement; isTrue: boolean }[] = [];
  let pairRows: { leftInput: HTMLInputElement; rightInput: HTMLInputElement }[] = [];
  let statementsContainer: HTMLElement | null = null;
  let pairsContainer: HTMLElement | null = null;

  // Options state for MCQ/Multi
  let initialOptions: { text: string; isCorrect: boolean }[] = [];

  if (kind === "mcq" || kind === "multi") {
    if (kind === "mcq") {
      initialOptions.push({ text: draft.answer || "", isCorrect: true });
      for (const d of draft.distractors || []) {
        initialOptions.push({ text: d, isCorrect: false });
      }
    } else {
      const correctSet = new Set(draft.answers || []);
      if (draft.answer && correctSet.size === 0) {
        correctSet.add(draft.answer);
      }
      for (const c of correctSet) {
        initialOptions.push({ text: c, isCorrect: true });
      }
      for (const d of draft.distractors || []) {
        if (!correctSet.has(d)) {
          initialOptions.push({ text: d, isCorrect: false });
        }
      }
    }
    while (initialOptions.length < 2) {
      initialOptions.push({ text: "", isCorrect: false });
    }
  }

  const optionsContainer = el("div", {
    class: optionsLayout === "table" ? "options-table" : "",
    style: "display:flex;flex-direction:column;gap:8px;margin-bottom:8px;",
  });

  const toggleOption = (idx: number) => {
    const opt = initialOptions[idx];
    if (kind === "mcq") {
      initialOptions.forEach((o, i) => o.isCorrect = (i === idx));
      renderOptions();
    } else {
      opt.isCorrect = !opt.isCorrect;
      renderOptions();
    }
  };

  const renderOptions = () => {
    optionsContainer.innerHTML = "";

    if (optionsLayout === "table") {
      const head = el("div", { class: "options-table-head" }, [
        el("span", { class: "option-index" }, ["#"]),
        el("span", {}, ["Option"]),
        el("span", {}, [kind === "mcq" ? "Correct" : "Correct?"]),
        el("span", {}, [""]),
      ]);
      optionsContainer.append(head);
    }

    initialOptions.forEach((opt, idx) => {
      const isCorrect = opt.isCorrect;
      const toggleBtn = el(
        "button",
        {
          type: "button",
          class: `toggle-correct-btn ${isCorrect ? "correct" : ""}`,
          title: kind === "mcq" ? "Mark this option as the correct answer" : "Toggle this option as a correct answer",
        },
        [isCorrect ? "✓" : ""],
      );

      const textInput = textarea(opt.text, `Option ${idx + 1}`);
      textInput.setAttribute("data-field", "option");
      textInput.setAttribute("data-index", String(idx));
      textInput.style.flex = "1";
      textInput.addEventListener("input", () => {
        opt.text = textInput.value;
      });

      const removeBtn = el(
        "button",
        {
          type: "button",
          style: "background:transparent;color:#B6A596;cursor:pointer;font-size:16px;padding:4px 8px;margin-left:4px;border:none;",
        },
        ["✕"],
      );

      removeBtn.addEventListener("click", () => {
        if (initialOptions.length > 2) {
          initialOptions.splice(idx, 1);
          renderOptions();
        }
      });

      const cells: HTMLElement[] =
        optionsLayout === "table"
          ? [el("span", { class: "option-index" }, [String(idx + 1)]), textInput, toggleBtn, removeBtn]
          : [toggleBtn, textInput, removeBtn];

      const rowEl = el("div", { class: optionsLayout === "table" ? "option-row option-row-table" : "option-row" }, cells);
      toggleBtn.addEventListener("click", () => toggleOption(idx));
      optionsContainer.append(rowEl);
    });
  };

  if (kind === "mcq" || kind === "multi") {
    renderOptions();
    const labelText = kind === "mcq" ? "Options (toggle checkmark to select correct)" : "Options (multiple correct allowed)";
    const addBtn = el("button", { type: "button", class: "add-btn" }, ["+ Add option"]);
    addBtn.addEventListener("click", () => {
      initialOptions.push({ text: "", isCorrect: false });
      renderOptions();
    });
    kindRoot.append(el("label", {}, [labelText]), optionsContainer, addBtn);
  } else if (kind === "flash") {
    answerField = textarea(draft.answer, "Back");
    answerField.setAttribute("data-field", "answer");
    kindRoot.append(el("label", {}, ["Answer (back)"]), answerField);
  } else if (kind === "tf-sort") {
    statementsContainer = el("div", { class: "recall-statements", style: "display:flex;flex-direction:column;gap:8px;margin-bottom:8px;" });
    const addRow = (text: string, isTrue: boolean) => {
      const textIndex = statementRows.length;
      const textInput = input(text, "Statement");
      textInput.setAttribute("data-field", "statement");
      textInput.setAttribute("data-index", String(textIndex));
      textInput.style.flex = "1";
      const trueBtn = el("button", {
        type: "button",
        style: "padding:6px 12px;background:#1e293b;color:#f8fafc;border:1px solid #334155;font-weight:700;min-width:36px;border-radius:4px;cursor:pointer;transition:all 0.15s ease;"
      }, [isTrue ? "T" : "F"]);
      const row = { textInput, trueBtn, isTrue };
      const updateTrueBtnStyle = () => {
        trueBtn.textContent = row.isTrue ? "T" : "F";
        if (row.isTrue) {
          trueBtn.style.background = "#38bdf8";
          trueBtn.style.color = "#0f172a";
          trueBtn.style.borderColor = "#38bdf8";
        } else {
          trueBtn.style.background = "#1e293b";
          trueBtn.style.color = "#f8fafc";
          trueBtn.style.borderColor = "#334155";
        }
      };
      updateTrueBtnStyle();
      trueBtn.addEventListener("click", () => {
        row.isTrue = !row.isTrue;
        updateTrueBtnStyle();
      });
      const removeBtn = el("button", {
        type: "button",
        style: "background:transparent;color:#94a3b8;cursor:pointer;font-size:16px;padding:4px 8px;border:none;"
      }, ["✕"]);
      const rowEl = el("div", { class: "option-row" }, [
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
    const addBtn = el("button", { type: "button", class: "add-btn" }, ["+ Add statement"]);
    addBtn.addEventListener("click", () => addRow("", true));
    kindRoot.append(el("label", {}, ["Statements"]), statementsContainer, addBtn);
  } else if (kind === "match") {
    pairsContainer = el("div", { class: "recall-pairs", style: "display:flex;flex-direction:column;gap:8px;margin-bottom:8px;" });
    const addRow = (left: string, right: string) => {
      const pairIndex = pairRows.length;
      const leftInput = input(left, "Left");
      leftInput.setAttribute("data-field", "pair-left");
      leftInput.setAttribute("data-index", String(pairIndex));
      leftInput.style.flex = "1";
      const rightInput = input(right, "Right");
      rightInput.setAttribute("data-field", "pair-right");
      rightInput.setAttribute("data-index", String(pairIndex));
      rightInput.style.flex = "1";
      const row = { leftInput, rightInput };
      const removeBtn = el("button", {
        type: "button",
        style: "background:transparent;color:#94a3b8;cursor:pointer;font-size:16px;padding:4px 8px;border:none;"
      }, ["✕"]);
      const rowEl = el("div", { class: "option-row" }, [
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
    const addBtn = el("button", { type: "button", class: "add-btn" }, ["+ Add pair"]);
    addBtn.addEventListener("click", () => addRow("", ""));
    kindRoot.append(el("label", {}, ["Pairs"]), pairsContainer, addBtn);
  }

  // Custom Tag Selector
  const selectedTags: { id?: string; name: string }[] = [];
  for (const tagStr of draft.tags) {
    const trimmed = tagStr.trim();
    if (!trimmed) continue;
    const existing = allTags.find(
      (t) => t.id === trimmed || t.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) {
      selectedTags.push({ id: existing.id, name: existing.name });
    } else {
      selectedTags.push({ name: trimmed });
    }
  }

  const tagSelectorContainer = el("div", { class: "tag-selector-container" });
  tagSelectorContainer.setAttribute("data-field", "tags");
  const chipsContainer = el("div", { style: "display:flex;flex-wrap:wrap;gap:6px;align-items:center;width:100%;" });
  tagSelectorContainer.append(chipsContainer);

  const tagInput = el("input", { type: "text", class: "tag-input", placeholder: "Search or create tag..." });
  chipsContainer.append(tagInput);

  const suggestionsList = el("ul", { class: "tag-suggestions", style: "display:none;" });
  tagSelectorContainer.append(suggestionsList);

  let query = "";
  let highlightIdx = 0;
  let open = false;
  let suggestions: { id?: string; name: string; isCreate?: boolean }[] = [];

  function getSuggestions() {
    const q = query.trim().toLowerCase();
    const takenNames = new Set(selectedTags.map((t) => t.name.toLowerCase()));
    const available = allTags.filter((t) => !takenNames.has(t.name.toLowerCase()));
    
    let filtered: { id?: string; name: string; isCreate?: boolean }[] = [];
    if (!q) {
      filtered = available.slice(0, 8);
    } else {
      const scored = available
        .map((t) => {
          const name = t.name.toLowerCase();
          let score = 0;
          if (name === q) score = 1000;
          else if (name.startsWith(q)) score = 500 - (name.length - q.length);
          else if (name.includes(q)) score = 200 - name.indexOf(q);
          return { t, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((x) => x.t);
      
      filtered = [...scored];
      const hasExactMatch = selectedTags.some((t) => t.name.toLowerCase() === q) || 
                            allTags.some((t) => t.name.toLowerCase() === q);
      if (q && !hasExactMatch) {
        filtered.push({ name: query.trim(), isCreate: true });
      }
    }
    return filtered;
  }

  function renderChips() {
    while (chipsContainer.firstChild && chipsContainer.firstChild !== tagInput) {
      chipsContainer.removeChild(chipsContainer.firstChild);
    }
    selectedTags.forEach((t) => {
      const isNew = !t.id;
      const chip = el("span", { class: `tag-chip ${isNew ? "new" : ""}` }, [t.name]);
      if (isNew) {
        chip.append(el("span", { style: "font-size:9px;opacity:0.7;margin-left:4px;" }, ["new"]));
      }
      const removeBtn = el("button", { type: "button", class: "tag-chip-remove" }, ["×"]);
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        selectedTags.splice(selectedTags.indexOf(t), 1);
        renderChips();
        tagInput.focus();
      });
      chip.append(removeBtn);
      chipsContainer.insertBefore(chip, tagInput);
    });
    tagInput.placeholder = selectedTags.length > 0 ? "" : "Search or create tag...";
  }

  function renderSuggestions() {
    suggestionsList.innerHTML = "";
    suggestions = getSuggestions();
    if (!open || suggestions.length === 0) {
      suggestionsList.style.display = "none";
      return;
    }
    suggestionsList.style.display = "block";
    suggestions.forEach((item, idx) => {
      const li = el("li", {
        class: `tag-suggestion-item ${idx === highlightIdx ? "highlighted" : ""}`
      });
      if (item.isCreate) {
        li.innerHTML = `<span>+ Create <strong>"${item.name}"</strong> <span style="opacity:0.7;font-size:10px;">(on save)</span></span>`;
      } else {
        li.innerHTML = `<span>${item.name}</span>`;
      }
      const hint = el("span", { class: "action-hint" });
      hint.textContent = item.isCreate ? "↵ create" : "↵ select";
      li.append(hint);

      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pickSuggestion(idx);
      });
      li.addEventListener("mouseenter", () => {
        highlightIdx = idx;
        renderSuggestions();
      });
      suggestionsList.append(li);
    });
  }

  function pickSuggestion(idx: number) {
    if (idx >= 0 && idx < suggestions.length) {
      const item = suggestions[idx];
      selectedTags.push({ id: item.id, name: item.name });
      query = "";
      tagInput.value = "";
      highlightIdx = 0;
      renderChips();
      renderSuggestions();
    }
  }

  tagInput.addEventListener("input", () => {
    query = tagInput.value;
    highlightIdx = 0;
    open = true;
    renderSuggestions();
  });
  tagInput.addEventListener("focus", () => {
    open = true;
    renderSuggestions();
  });
  tagInput.addEventListener("blur", () => {
    setTimeout(() => {
      open = false;
      renderSuggestions();
    }, 150);
  });
  tagInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      open = true;
      highlightIdx = (highlightIdx + 1) % Math.max(1, suggestions.length);
      renderSuggestions();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      open = true;
      highlightIdx = (highlightIdx - 1 + suggestions.length) % Math.max(1, suggestions.length);
      renderSuggestions();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length > 0) {
        pickSuggestion(highlightIdx);
      }
    } else if (e.key === "," || e.key === "Tab") {
      if (query.trim()) {
        e.preventDefault();
        if (suggestions.length > 0) {
          pickSuggestion(highlightIdx);
        }
      }
    } else if (e.key === "Backspace" && query === "") {
      if (selectedTags.length > 0) {
        e.preventDefault();
        selectedTags.pop();
        renderChips();
      }
    } else if (e.key === "Escape") {
      open = false;
      renderSuggestions();
    }
  });

  tagSelectorContainer.addEventListener("click", () => {
    tagInput.focus();
  });

  renderChips();
  kindRoot.append(el("label", {}, ["Tags"]), tagSelectorContainer);

  // Explanation and Hint fields rendered in the left column (metaRoot)
  const explanationField = textarea(draft.explanation, "Explanation");
  explanationField.setAttribute("data-field", "explanation");
  metaRoot.append(el("label", {}, ["Explanation"]), explanationField);
  const hintField = textarea(draft.hint, "Hint");
  hintField.setAttribute("data-field", "hint");
  metaRoot.append(el("label", {}, ["Hint"]), hintField);

  // Reference Images array
  const referenceImages: string[] = draft.referenceImages ?? [];
  const imagesContainer = el("div", { class: "reference-images-container", style: "margin-top:12px;" });
  metaRoot.append(imagesContainer);

  function renderImages() {
    imagesContainer.innerHTML = "";
    imagesContainer.append(el("label", {}, ["Reference Images"]));

    const grid = el("div", {
      style: "display:grid;grid-template-columns:repeat(auto-fill, minmax(64px, 1fr));gap:8px;margin-bottom:8px;"
    });

    referenceImages.forEach((imgUrl, imgIdx) => {
      const thumb = el("div", {
        style: "position:relative;width:64px;height:64px;border:1px solid #4a4441;border-radius:4px;overflow:hidden;background:#121212;"
      });

      const img = el("img", {
        src: imgUrl,
        style: "width:100%;height:100%;object-fit:cover;"
      });

      const delBtn = el("button", {
        type: "button",
        style: "position:absolute;top:2px;right:2px;background:rgba(24,24,24,0.7);color:#EBDCC4;border:none;border-radius:2px;width:16px;height:16px;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;"
      }, ["✕"]);

      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        referenceImages.splice(imgIdx, 1);
        renderImages();
      });

      thumb.append(img, delBtn);
      grid.append(thumb);
    });

    const uploadZone = el("div", {
      class: "image-upload-zone",
      style: "border:1px dashed #4a4441;border-radius:4px;padding:12px;text-align:center;cursor:pointer;background:#121212;color:#B6A596;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:4px;"
    });

    const statusText = el("span", {}, ["📷 Click/Drop or Paste (Ctrl+V)"]);
    uploadZone.append(statusText);

    const fileInput = el("input", {
      type: "file",
      accept: "image/*",
      style: "display:none;"
    });
    uploadZone.append(fileInput);

    uploadZone.addEventListener("click", () => fileInput.click());

    async function handleFile(file: File) {
      statusText.textContent = "Compressing...";
      try {
        const compressedDataUrl = await compressImageToLimit(file);
        statusText.textContent = "Uploading...";
        const res = await chrome.runtime.sendMessage({
          type: "UPLOAD_IMAGE",
          fileDataUrl: compressedDataUrl
        });
        if (res && res.url) {
          referenceImages.push(res.url);
          statusText.textContent = "📷 Click/Drop or Paste (Ctrl+V)";
          renderImages();
        } else {
          statusText.textContent = "Upload failed!";
          setTimeout(() => { statusText.textContent = "📷 Click/Drop or Paste (Ctrl+V)"; }, 2000);
        }
      } catch (err) {
        console.error(err);
        statusText.textContent = "Error!";
        setTimeout(() => { statusText.textContent = "📷 Click/Drop or Paste (Ctrl+V)"; }, 2000);
      }
    }

    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) handleFile(file);
    });

    grid.append(uploadZone);
    imagesContainer.append(grid);
  }

  renderImages();

  // Listen to paste events inside the fields elements to capture image clips
  const onPaste = async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          const statusSpan = imagesContainer.querySelector(".image-upload-zone span");
          if (statusSpan) statusSpan.textContent = "Compressing...";
          try {
            const compressedDataUrl = await compressImageToLimit(file);
            if (statusSpan) statusSpan.textContent = "Uploading...";
            const res = await chrome.runtime.sendMessage({
              type: "UPLOAD_IMAGE",
              fileDataUrl: compressedDataUrl
            });
            if (res && res.url) {
              referenceImages.push(res.url);
              renderImages();
            } else {
              if (statusSpan) statusSpan.textContent = "Upload failed!";
              setTimeout(() => { if (statusSpan) statusSpan.textContent = "📷 Click/Drop or Paste (Ctrl+V)"; }, 2000);
            }
          } catch (err) {
            console.error(err);
            if (statusSpan) statusSpan.textContent = "Error!";
            setTimeout(() => { if (statusSpan) statusSpan.textContent = "📷 Click/Drop or Paste (Ctrl+V)"; }, 2000);
          }
        }
      }
    }
  };

  kindRoot.addEventListener("paste", onPaste);
  metaRoot.addEventListener("paste", onPaste);

  function readValues(): CardDraft {
    const tags = selectedTags.map((t) => t.id || t.name);
    const base: CardDraft = {
      kind,
      question: kind === "cloze" ? "" : questionField.value,
      answer: kind === "flash" ? (answerField?.value ?? "") : "",
      distractors: [],
      tags,
      explanation: explanationField.value,
      hint: hintField.value,
      referenceImages,
    };
    if (kind === "cloze") base.clozeText = questionField.value;
    if (kind === "tf-sort") {
      base.statements = statementRows.map((r) => ({ text: r.textInput.value, isTrue: r.isTrue }));
    }
    if (kind === "match") {
      base.pairs = pairRows.map((r) => ({ left: r.leftInput.value, right: r.rightInput.value }));
    }
    if (kind === "mcq" || kind === "multi") {
      const correct = initialOptions.filter(o => o.isCorrect).map(o => o.text);
      const distractors = initialOptions.filter(o => !o.isCorrect).map(o => o.text);
      base.answer = correct[0] ?? "";
      base.answers = correct;
      base.distractors = distractors;
    }
    return base;
  }

  return { readValues };
}

async function compressImageToLimit(file: File, maxSizeBytes = 100 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        let quality = 0.9;
        
        const attemptCompress = () => {
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error("Compression failed"));
              return;
            }
            if (blob.size <= maxSizeBytes || quality <= 0.2) {
              const fileReader = new FileReader();
              fileReader.onloadend = () => {
                resolve(fileReader.result as string);
              };
              fileReader.onerror = () => reject(new Error("Failed to read compressed blob"));
              fileReader.readAsDataURL(blob);
            } else {
              if (quality > 0.4) {
                quality -= 0.1;
              } else {
                width = Math.round(width * 0.85);
                height = Math.round(height * 0.85);
                canvas.width = width;
                canvas.height = height;
                ctx?.drawImage(img, 0, 0, width, height);
                quality = 0.7; 
              }
              attemptCompress();
            }
          }, "image/jpeg", quality);
        };
        attemptCompress();
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
