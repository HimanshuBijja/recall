import type { CardDraft, CaptureKind } from "../../shared/types";
import { renderFields, type FieldsRoot, type SourceMeta } from "./fields";

export interface AIEditorContext {
  shadow: ShadowRoot;
  card: HTMLElement;
  backdrop: HTMLElement;
  opts: {
    kind: CaptureKind;
    source: SourceMeta;
    screenshotUrl?: string;
    marker?: { shape: string; color: string };
  };
  allTags: { id: string; name: string }[];
  kindFieldsRoot: HTMLElement;
  metaFieldsRoot: HTMLElement;
  aiBtn: HTMLButtonElement;
  getFields: () => FieldsRoot;
  setFields: (fields: FieldsRoot) => void;
}

export function initAIEditor(ctx: AIEditorContext): void {
  const {
    shadow,
    card,
    backdrop,
    opts,
    allTags,
    kindFieldsRoot,
    metaFieldsRoot,
    aiBtn,
    getFields,
    setFields,
  } = ctx;

  const floatingAI = document.createElement("div");
  floatingAI.style.cssText = "position:fixed;z-index:2147483647;display:none;";
  shadow.append(floatingAI);

  let currentAIState: "none" | "button" | "chat" | "loading" | "preview" | "global-chat" | "global-loading" = "none";
  let lastMouseX = 0;
  let lastMouseY = 0;

  card.addEventListener("mouseup", (e: MouseEvent) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    setTimeout(handleSelection, 0);
  });

  card.addEventListener("keyup", () => {
    handleSelection();
  });

  backdrop.addEventListener("mousedown", (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (floatingAI.style.display !== "none" && !floatingAI.contains(target)) {
      hideAskAI();
    }
  });

  aiBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showGlobalAIChat();
  });

  function hideAskAI() {
    currentAIState = "none";
    floatingAI.style.display = "none";
    floatingAI.innerHTML = "";
  }

  function handleSelection() {
    const sel = (shadow as any).getSelection();
    const selText = sel ? sel.toString().trim() : "";
    const activeEl = shadow.activeElement;
    
    const isTextInput = activeEl instanceof HTMLTextAreaElement || 
                        (activeEl instanceof HTMLInputElement && activeEl.type === "text" && !activeEl.classList.contains("tag-input"));
    
    if (selText && isTextInput) {
      if (currentAIState === "none" || currentAIState === "button") {
        showAskAIButton(selText, activeEl as HTMLTextAreaElement | HTMLInputElement);
      }
    } else {
      if (currentAIState === "button") {
        hideAskAI();
      }
    }
  }

  function showAskAIButton(selText: string, activeEl: HTMLTextAreaElement | HTMLInputElement) {
    currentAIState = "button";
    floatingAI.innerHTML = "";
    floatingAI.style.display = "block";
    floatingAI.style.left = `${lastMouseX}px`;
    floatingAI.style.top = `${lastMouseY - 32}px`;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "save";
    btn.style.cssText = "padding:4px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;border-radius:4px;border:none;cursor:pointer;background:#38bdf8;color:#0f172a;";
    btn.textContent = "Ask AI";
    floatingAI.append(btn);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      showAIChat(selText, activeEl);
    });
  }

  function showAIChat(selText: string, activeEl: HTMLTextAreaElement | HTMLInputElement) {
    currentAIState = "chat";
    floatingAI.innerHTML = "";
    floatingAI.style.left = `${lastMouseX}px`;
    floatingAI.style.top = `${lastMouseY + 12}px`;

    const chatContainer = document.createElement("div");
    chatContainer.style.cssText = "display:flex;align-items:center;background:#1c1c1f;border:1px solid #2e2e33;border-radius:18px;padding:3px 6px;gap:4px;box-shadow:0 4px 12px rgba(0,0,0,0.5);width:220px;box-sizing:border-box;";

    const textPrompt = document.createElement("textarea");
    textPrompt.placeholder = "Ask AI to edit...";
    textPrompt.rows = 1;
    textPrompt.style.cssText = "background:transparent;border:none;outline:none;color:#f4f4f5;font-size:12px;flex:1;resize:none;height:20px;max-height:60px;overflow-y:auto;padding:2px 4px;font-family:inherit;box-sizing:border-box;";

    textPrompt.addEventListener("input", () => {
      textPrompt.style.height = "auto";
      textPrompt.style.height = `${Math.min(60, textPrompt.scrollHeight)}px`;
    });

    const sendBtn = document.createElement("button");
    sendBtn.type = "button";
    sendBtn.style.cssText = "width:22px;height:22px;border-radius:50%;background:#ffffff;color:#09090b;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;padding:0;flex-shrink:0;";
    sendBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;

    chatContainer.append(textPrompt, sendBtn);
    floatingAI.append(chatContainer);
    
    setTimeout(() => textPrompt.focus(), 0);

    textPrompt.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        sendPrompt();
      }
    });

    async function sendPrompt() {
      const promptText = textPrompt.value.trim();
      if (!promptText) return;
      
      currentAIState = "loading";
      textPrompt.disabled = true;
      sendBtn.disabled = true;
      sendBtn.innerHTML = "...";

      try {
        const res = await chrome.runtime.sendMessage({
          type: "EDIT_TEXT",
          selection: selText,
          prompt: promptText
        });
        if (res && res.editedText) {
          showAIPreview(selText, res.editedText.trim(), activeEl);
        } else {
          showAIError(res?.error || "Failed to edit");
        }
      } catch (err) {
        showAIError(err instanceof Error ? err.message : "Failed to edit");
      }
    }

    sendBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      sendPrompt();
    });
  }

  function showAIPreview(original: string, suggested: string, activeEl: HTMLTextAreaElement | HTMLInputElement) {
    currentAIState = "preview";
    floatingAI.innerHTML = "";
    floatingAI.style.left = `${lastMouseX}px`;
    floatingAI.style.top = `${lastMouseY + 12}px`;
    
    const previewContainer = document.createElement("div");
    previewContainer.style.cssText = "display:flex;align-items:center;background:#1c1c1f;border:1px solid #2e2e33;border-radius:18px;padding:3px 6px;gap:6px;box-shadow:0 4px 12px rgba(0,0,0,0.5);width:240px;box-sizing:border-box;";

    const suggestionBox = document.createElement("div");
    suggestionBox.style.cssText = "flex:1;font-size:11px;color:#f4f4f5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-left:6px;";
    suggestionBox.textContent = suggested;
    suggestionBox.title = suggested;

    const declineBtn = document.createElement("button");
    declineBtn.type = "button";
    declineBtn.title = "Decline";
    declineBtn.style.cssText = "width:22px;height:22px;border-radius:50%;background:#fda4af;color:#09090b;display:inline-flex;align-items:center;justify-content:center;border:none;cursor:pointer;font-size:12px;font-weight:bold;flex-shrink:0;";
    declineBtn.textContent = "✗";

    const acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.title = "Accept";
    acceptBtn.style.cssText = "width:22px;height:22px;border-radius:50%;background:#86efac;color:#09090b;display:inline-flex;align-items:center;justify-content:center;border:none;cursor:pointer;font-size:11px;font-weight:bold;flex-shrink:0;";
    acceptBtn.textContent = "✓";

    previewContainer.append(suggestionBox, declineBtn, acceptBtn);
    floatingAI.append(previewContainer);

    declineBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      hideAskAI();
    });

    acceptBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const start = activeEl.selectionStart || 0;
      const end = activeEl.selectionEnd || 0;
      const val = activeEl.value;
      const newVal = val.slice(0, start) + suggested + val.slice(end);
      activeEl.value = newVal;
      
      activeEl.dispatchEvent(new Event("input", { bubbles: true }));
      hideAskAI();
    });
  }

  function showGlobalAIChat() {
    currentAIState = "global-chat";
    floatingAI.innerHTML = "";
    floatingAI.style.display = "block";
    const rect = aiBtn.getBoundingClientRect();
    floatingAI.style.left = `${rect.right - 250}px`;
    floatingAI.style.top = `${rect.bottom + 8}px`;

    const chatContainer = document.createElement("div");
    chatContainer.style.cssText = "display:flex;align-items:center;background:#1c1c1f;border:1px solid #2e2e33;border-radius:18px;padding:3px 6px;gap:4px;box-shadow:0 4px 12px rgba(0,0,0,0.5);width:240px;box-sizing:border-box;";

    const textPrompt = document.createElement("textarea");
    textPrompt.placeholder = "Ask AI to edit card...";
    textPrompt.rows = 1;
    textPrompt.style.cssText = "background:transparent;border:none;outline:none;color:#f4f4f5;font-size:12px;flex:1;resize:none;height:20px;max-height:60px;overflow-y:auto;padding:2px 4px;font-family:inherit;box-sizing:border-box;";

    textPrompt.addEventListener("input", () => {
      textPrompt.style.height = "auto";
      textPrompt.style.height = `${Math.min(60, textPrompt.scrollHeight)}px`;
    });

    const sendBtn = document.createElement("button");
    sendBtn.type = "button";
    sendBtn.style.cssText = "width:22px;height:22px;border-radius:50%;background:#ffffff;color:#09090b;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;padding:0;flex-shrink:0;";
    sendBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;

    chatContainer.append(textPrompt, sendBtn);
    floatingAI.append(chatContainer);
    
    setTimeout(() => textPrompt.focus(), 0);

    textPrompt.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        sendPrompt();
      }
    });

    async function sendPrompt() {
      const promptText = textPrompt.value.trim();
      if (!promptText) return;
      
      currentAIState = "global-loading";
      textPrompt.disabled = true;
      sendBtn.disabled = true;
      sendBtn.innerHTML = "...";

      try {
        const currentDraft = getFields().readValues();
        const res = await chrome.runtime.sendMessage({
          type: "EDIT_TEXT",
          draft: currentDraft,
          prompt: promptText
        });
        if (res && res.draft) {
          showGlobalAIPreview(currentDraft, res.draft);
        } else {
          showAIError(res?.error || "Failed to edit card");
        }
      } catch (err) {
        showAIError(err instanceof Error ? err.message : "Failed to edit card");
      }
    }

    sendBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      sendPrompt();
    });
  }

  function showGlobalAIPreview(originalDraft: CardDraft, updatedDraft: CardDraft) {
    currentAIState = "preview";
    floatingAI.innerHTML = "";
    floatingAI.style.display = "block";
    const rect = aiBtn.getBoundingClientRect();
    floatingAI.style.left = `${rect.right - 250}px`;
    floatingAI.style.top = `${rect.bottom + 8}px`;

    const activeDraft = JSON.parse(JSON.stringify(updatedDraft));
    const origDraft = JSON.parse(JSON.stringify(originalDraft));

    const previewContainer = document.createElement("div");
    previewContainer.style.cssText = "background:#1c1c1f;border:1px solid #2e2e33;border-radius:4px;padding:10px;width:240px;display:flex;flex-direction:column;gap:8px;box-shadow:0 4px 12px rgba(0,0,0,0.5);";

    const label = document.createElement("div");
    label.style.cssText = "font-size:10px;font-weight:700;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.05em;";
    label.textContent = "AI Card Changes Applied:";

    const hint = document.createElement("div");
    hint.style.cssText = "font-size:11px;color:#f4f4f5;";
    hint.textContent = "Review individual changes modularly or accept all globally.";

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:6px;justify-content:flex-end;";

    const declineBtn = document.createElement("button");
    declineBtn.type = "button";
    declineBtn.textContent = "Decline All";
    declineBtn.style.cssText = "padding:6px 12px;background:#fda4af;color:#09090b;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;border-radius:4px;border:none;cursor:pointer;";

    const acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.textContent = "Accept All";
    acceptBtn.style.cssText = "padding:6px 12px;background:#86efac;color:#09090b;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;border-radius:4px;border:none;cursor:pointer;";

    btnRow.append(declineBtn, acceptBtn);
    previewContainer.append(label, hint, btnRow);
    floatingAI.append(previewContainer);

    function clearPills() {
      const existingPills = Array.from(card.querySelectorAll(".modular-change-pill"));
      existingPills.forEach(p => p.remove());

      const elements = Array.from(shadow.querySelectorAll("textarea, input"));
      elements.forEach((el) => {
        (el as HTMLElement).style.opacity = "";
        (el as HTMLElement).style.display = "";
        (el as HTMLElement).style.pointerEvents = "";
      });
      const rows = Array.from(shadow.querySelectorAll(".option-row"));
      rows.forEach((el) => {
        (el as HTMLElement).style.display = "";
      });
    }

    function renderFormAndPills() {
      clearPills();
      
      const newFields = renderFields(opts.kind, activeDraft, kindFieldsRoot, metaFieldsRoot, allTags);
      setFields(newFields);
      console.debug("[Recall] renderFormAndPills activeDraft vs origDraft:", { activeDraft, origDraft });

      const addPill = (targetEl: HTMLElement, fieldName: string, onAccept: () => void, onReject: () => void, originalText: string, suggestedText: string) => {
        // Find if target is inside an option row to hide the entire row wrapper instead of just the textarea
        const rowWrapper = targetEl.closest('.option-row') as HTMLElement;
        const displayEl = rowWrapper || targetEl;

        // Hide original element completely from document flow
        displayEl.style.display = "none";

        const parent = displayEl.parentElement;
        if (!parent) return;

        const diffOverlay = document.createElement("div");
        diffOverlay.className = "modular-change-pill";
        diffOverlay.style.cssText = "position:relative;display:flex;flex-direction:column;width:100%;box-sizing:border-box;margin-top:4px;";

        const origBox = document.createElement("div");
        origBox.style.cssText = "background:rgba(244,63,94,0.06);border:1px dashed rgba(244,63,94,0.2);padding:8px 12px;border-radius:4px;color:#fda4af;text-decoration:line-through;font-size:13px;font-family:inherit;white-space:pre-wrap;box-sizing:border-box;min-height:34px;width:100%;line-height:1.4;";
        origBox.textContent = originalText || "(empty)";

        const suggBox = document.createElement("div");
        suggBox.style.cssText = "background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);padding:8px 12px;border-radius:4px;color:#86efac;font-size:13px;font-family:inherit;white-space:pre-wrap;box-sizing:border-box;min-height:34px;width:100%;margin-top:4px;line-height:1.4;";
        suggBox.textContent = suggestedText || "(empty)";

        const controlPill = document.createElement("div");
        controlPill.style.cssText = "position:absolute;top:6px;right:6px;display:flex;align-items:center;background:#1c1c1f;border:1px solid #2e2e33;border-radius:8px;padding:3px;gap:4px;box-shadow:0 4px 12px rgba(0,0,0,0.5);z-index:100;";

        const acceptBtn = document.createElement("button");
        acceptBtn.type = "button";
        acceptBtn.title = "Keep change";
        acceptBtn.style.cssText = "width:24px;height:24px;border-radius:6px;background:#2e2e33;border:none;color:#86efac;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;font-weight:bold;padding:0;flex-shrink:0;transition:background 0.1s;";
        acceptBtn.textContent = "✓";

        const declineBtn = document.createElement("button");
        declineBtn.type = "button";
        declineBtn.title = "Revert change";
        declineBtn.style.cssText = "width:24px;height:24px;border-radius:6px;background:transparent;border:none;color:#fda4af;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px;font-weight:bold;padding:0;flex-shrink:0;transition:background 0.1s;";
        declineBtn.textContent = "✗";

        controlPill.append(acceptBtn, declineBtn);
        diffOverlay.append(origBox, suggBox, controlPill);

        if (displayEl.nextSibling) {
          parent.insertBefore(diffOverlay, displayEl.nextSibling);
        } else {
          parent.appendChild(diffOverlay);
        }
        
        console.debug(`[Recall] addPill inline diff overlay created for: ${fieldName}`, { originalText, suggestedText });

        declineBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          displayEl.style.display = "";
          diffOverlay.remove();
          onReject();
        });

        acceptBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          displayEl.style.display = "";
          diffOverlay.remove();
          onAccept();
        });
      };

      // Question / Cloze text
      const qVal = opts.kind === "cloze" ? (activeDraft.clozeText ?? "") : activeDraft.question;
      const origQVal = opts.kind === "cloze" ? (origDraft.clozeText ?? "") : origDraft.question;
      if (qVal !== origQVal) {
        const target = shadow.querySelector('[data-field="question"]') as HTMLElement;
        if (target) {
          addPill(target, "question", () => {
            origDraft.question = activeDraft.question;
            if (origDraft.clozeText) origDraft.clozeText = activeDraft.clozeText;
            renderFormAndPills();
          }, () => {
            activeDraft.question = origDraft.question;
            if (activeDraft.clozeText) activeDraft.clozeText = origDraft.clozeText;
            renderFormAndPills();
          }, origQVal, qVal);
        }
      }

      // Explanation
      if (activeDraft.explanation !== origDraft.explanation) {
        const target = shadow.querySelector('[data-field="explanation"]') as HTMLElement;
        if (target) {
          addPill(target, "explanation", () => {
            origDraft.explanation = activeDraft.explanation;
            renderFormAndPills();
          }, () => {
            activeDraft.explanation = origDraft.explanation;
            renderFormAndPills();
          }, origDraft.explanation || "", activeDraft.explanation || "");
        }
      }

      // Hint
      if (activeDraft.hint !== origDraft.hint) {
        const target = shadow.querySelector('[data-field="hint"]') as HTMLElement;
        if (target) {
          addPill(target, "hint", () => {
            origDraft.hint = activeDraft.hint;
            renderFormAndPills();
          }, () => {
            activeDraft.hint = origDraft.hint;
            renderFormAndPills();
          }, origDraft.hint || "", activeDraft.hint || "");
        }
      }

      // Flash Answer
      if (opts.kind === "flash" && activeDraft.answer !== origDraft.answer) {
        const target = shadow.querySelector('[data-field="answer"]') as HTMLElement;
        if (target) {
          addPill(target, "answer", () => {
            origDraft.answer = activeDraft.answer;
            renderFormAndPills();
          }, () => {
            activeDraft.answer = origDraft.answer;
            renderFormAndPills();
          }, origDraft.answer || "", activeDraft.answer || "");
        }
      }

      // Tags
      const activeTagsStr = (activeDraft.tags || []).join(",");
      const origTagsStr = (origDraft.tags || []).join(",");
      if (activeTagsStr !== origTagsStr) {
        const target = shadow.querySelector('[data-field="tags"]') as HTMLElement;
        if (target) {
          addPill(target, "tags", () => {
            origDraft.tags = [...activeDraft.tags];
            renderFormAndPills();
          }, () => {
            activeDraft.tags = [...origDraft.tags];
            renderFormAndPills();
          }, origDraft.tags.join(", "), activeDraft.tags.join(", "));
        }
      }

      // MCQ/Multi Options
      if (opts.kind === "mcq" || opts.kind === "multi") {
        const origOptionsText = opts.kind === "mcq"
          ? [origDraft.answer, ...(origDraft.distractors || [])]
          : [...(origDraft.answers || []), ...(origDraft.distractors || [])];
        const activeOptionsText = opts.kind === "mcq"
          ? [activeDraft.answer, ...(activeDraft.distractors || [])]
          : [...(activeDraft.answers || []), ...(activeDraft.distractors || [])];

        activeOptionsText.forEach((optText, idx) => {
          const origText = origOptionsText[idx] ?? "";
          if (optText !== origText) {
            const target = shadow.querySelector(`[data-field="option"][data-index="${idx}"]`) as HTMLElement;
            if (target) {
              addPill(target, `option-${idx}`, () => {
                if (opts.kind === "mcq") {
                  if (idx === 0) origDraft.answer = optText;
                  else {
                    if (!origDraft.distractors) origDraft.distractors = [];
                    origDraft.distractors[idx - 1] = optText;
                  }
                } else {
                  const answersCount = (origDraft.answers || []).length;
                  if (idx < answersCount) {
                    origDraft.answers![idx] = optText;
                  } else {
                    if (!origDraft.distractors) origDraft.distractors = [];
                    origDraft.distractors[idx - answersCount] = optText;
                  }
                }
                renderFormAndPills();
              }, () => {
                if (opts.kind === "mcq") {
                  if (idx === 0) activeDraft.answer = origDraft.answer;
                  else {
                    activeDraft.distractors[idx - 1] = origDraft.distractors[idx - 1];
                  }
                } else {
                  const answersCount = (origDraft.answers || []).length;
                  if (idx < answersCount) {
                    activeDraft.answers![idx] = origDraft.answers![idx];
                  } else {
                    activeDraft.distractors[idx - answersCount] = origDraft.distractors[idx - answersCount];
                  }
                }
                renderFormAndPills();
              }, origText, optText);
            }
          }
        });
      }

      // True/False Statements
      if (opts.kind === "tf-sort") {
        const origStatements = origDraft.statements || [];
        const activeStatements = activeDraft.statements || [];
        activeStatements.forEach((stmt: { text: string; isTrue: boolean }, idx: number) => {
          const origStmt = origStatements[idx];
          if (!origStmt || stmt.text !== origStmt.text || stmt.isTrue !== origStmt.isTrue) {
            const target = shadow.querySelector(`[data-field="statement"][data-index="${idx}"]`) as HTMLElement;
            if (target) {
              addPill(target, `statement-${idx}`, () => {
                if (!origDraft.statements) origDraft.statements = [];
                origDraft.statements[idx] = { ...stmt };
                renderFormAndPills();
              }, () => {
                if (origStmt) {
                  activeDraft.statements![idx] = { ...origStmt };
                } else {
                  activeDraft.statements!.splice(idx, 1);
                }
                renderFormAndPills();
              }, origStmt ? `${origStmt.text} (${origStmt.isTrue ? "T" : "F"})` : "(empty)", `${stmt.text} (${stmt.isTrue ? "T" : "F"})`);
            }
          }
        });
      }

      // Matching Pairs
      if (opts.kind === "match") {
        const origPairs = origDraft.pairs || [];
        const activePairs = activeDraft.pairs || [];
        activePairs.forEach((pair: { left: string; right: string }, idx: number) => {
          const origPair = origPairs[idx];
          if (!origPair || pair.left !== origPair.left || pair.right !== origPair.right) {
            const targetLeft = shadow.querySelector(`[data-field="pair-left"][data-index="${idx}"]`) as HTMLElement;
            if (targetLeft) {
              addPill(targetLeft, `pair-left-${idx}`, () => {
                if (!origDraft.pairs) origDraft.pairs = [];
                if (!origDraft.pairs[idx]) origDraft.pairs[idx] = { left: "", right: "" };
                origDraft.pairs[idx].left = pair.left;
                renderFormAndPills();
              }, () => {
                if (origPair) {
                  activeDraft.pairs![idx].left = origPair.left;
                } else {
                  activeDraft.pairs!.splice(idx, 1);
                }
                renderFormAndPills();
              }, origPair ? origPair.left : "(empty)", pair.left);
            }
            const targetRight = shadow.querySelector(`[data-field="pair-right"][data-index="${idx}"]`) as HTMLElement;
            if (targetRight) {
              addPill(targetRight, `pair-right-${idx}`, () => {
                if (!origDraft.pairs) origDraft.pairs = [];
                if (!origDraft.pairs[idx]) origDraft.pairs[idx] = { left: "", right: "" };
                origDraft.pairs[idx].right = pair.right;
                renderFormAndPills();
              }, () => {
                if (origPair) {
                  activeDraft.pairs![idx].right = origPair.right;
                } else {
                  activeDraft.pairs!.splice(idx, 1);
                }
                renderFormAndPills();
              }, origPair ? origPair.right : "(empty)", pair.right);
            }
          }
        });
      }
    }

    renderFormAndPills();

    declineBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const origFields = renderFields(opts.kind, originalDraft, kindFieldsRoot, metaFieldsRoot, allTags);
      setFields(origFields);
      clearPills();
      hideAskAI();
    });

    acceptBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const updatedFields = renderFields(opts.kind, activeDraft, kindFieldsRoot, metaFieldsRoot, allTags);
      setFields(updatedFields);
      clearPills();
      hideAskAI();
    });
  }

  function showAIError(errStr: string) {
    currentAIState = "preview";
    floatingAI.innerHTML = "";
    floatingAI.style.left = `${lastMouseX}px`;
    floatingAI.style.top = `${lastMouseY + 12}px`;
    
    const errorContainer = document.createElement("div");
    errorContainer.style.cssText = "background:#1e293b;border:1px solid #fda4af;border-radius:4px;padding:10px;width:220px;display:flex;flex-direction:column;gap:8px;box-shadow:0 4px 12px rgba(0,0,0,0.5);";

    const label = document.createElement("div");
    label.style.cssText = "font-size:10px;font-weight:700;color:#fda4af;text-transform:uppercase;letter-spacing:0.05em;";
    label.textContent = "Error:";

    const errBox = document.createElement("div");
    errBox.style.cssText = "font-size:12px;color:#f8fafc;";
    errBox.textContent = errStr;

    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.textContent = "Close";
    okBtn.style.cssText = "padding:4px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;border-radius:4px;border:none;background:#fda4af;color:#0f172a;cursor:pointer;width:fit-content;align-self:flex-end;";

    errorContainer.append(label, errBox, okBtn);
    floatingAI.append(errorContainer);

    okBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      hideAskAI();
    });
  }
}
