import type { CardDraft, CaptureKind } from "../../shared/types";
import { draftToCard, renderFields, type FieldsRoot, type SourceMeta } from "./fields";
import { overlayStyles, batchStyles } from "./styles";
import { initAIEditor } from "./ai";

export interface BatchOverlayOptions {
  kind: CaptureKind;
  drafts: CardDraft[];
  source: SourceMeta;
  allTags?: { id: string; name: string }[];
  groupName?: string;
}

export type BatchResult =
  | { action: "save"; cards: Record<string, unknown>[]; groupName?: string }
  | { action: "cancel" };

const HOST_ID = "recall-batch-overlay-host";

interface CardEntry {
  section: HTMLElement;
  fields: FieldsRoot;
  discarded: boolean;
}

function summarize(draft: CardDraft): string {
  const text = draft.kind === "cloze" ? (draft.clozeText ?? "") : draft.question;
  const trimmed = text.trim() || "(no question text)";
  return trimmed.length > 90 ? `${trimmed.slice(0, 90)}…` : trimmed;
}

export function openBatchOverlay(opts: BatchOverlayOptions): Promise<BatchResult> {
  document.getElementById(HOST_ID)?.remove();
  const allTags = opts.allTags ?? [];

  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = overlayStyles + batchStyles;

    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    const card = document.createElement("div");
    card.className = "card";
    backdrop.append(card);
    shadow.append(style, backdrop);

    // --- header ---
    const headerRow = document.createElement("div");
    headerRow.className = "header-row";

    let groupName = opts.groupName || "";

    const heading = document.createElement("div");
    heading.className = "batch-heading";
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = opts.kind;
    const count = document.createElement("span");
    count.className = "batch-count";
    heading.append(badge, count);

    if (opts.source.type === "web") {
      const groupLabel = document.createElement("span");
      groupLabel.style.cssText = "font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#B6A596;margin-left:16px;white-space:nowrap;";
      groupLabel.textContent = "Group:";

      const groupInput = document.createElement("input");
      groupInput.type = "text";
      groupInput.value = groupName;
      groupInput.placeholder = "Group Name (e.g. Topic)";
      groupInput.style.cssText = "background:#121212;border:1px solid #2e2927;color:#EBDCC4;font-size:12px;padding:4px 8px;border-radius:4px;width:240px;box-sizing:border-box;";
      groupInput.addEventListener("input", () => {
        groupName = groupInput.value.trim();
      });
      groupInput.addEventListener("keydown", (e) => {
        e.stopPropagation();
      });
      heading.append(groupLabel, groupInput);
    }

    const actions = document.createElement("div");
    actions.className = "actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "cancel";
    cancelBtn.textContent = "Cancel";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "save";
    saveBtn.textContent = "Save all";
    actions.append(cancelBtn, saveBtn);

    headerRow.append(heading, actions);
    card.append(headerRow);

    const list = document.createElement("div");
    list.className = "batch-list";
    card.append(list);

    const entries: CardEntry[] = [];

    function kept(): CardEntry[] {
      return entries.filter((e) => !e.discarded);
    }

    function refreshCount(): void {
      const n = kept().length;
      count.textContent = n === 1 ? "1 card" : `${n} cards`;
      saveBtn.disabled = n === 0;
    }

    opts.drafts.forEach((draft, idx) => {
      const section = document.createElement("div");
      section.className = "batch-card";

      const head = document.createElement("div");
      head.className = "batch-card-head";

      const chevron = document.createElement("button");
      chevron.type = "button";
      chevron.className = "batch-chevron";
      chevron.textContent = idx === 0 ? "▾" : "▸";

      const index = document.createElement("span");
      index.className = "batch-index";
      index.textContent = String(idx + 1);

      const summary = document.createElement("span");
      summary.className = "batch-summary";
      summary.textContent = summarize(draft);

      const aiBtn = document.createElement("button");
      aiBtn.className = "global-ai-btn";
      aiBtn.type = "button";
      aiBtn.title = "Ask AI to edit this card";
      aiBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`;

      const discard = document.createElement("button");
      discard.type = "button";
      discard.className = "batch-discard";
      discard.title = "Discard this card";
      discard.textContent = "✕";

      head.append(chevron, index, summary, aiBtn, discard);

      const body = document.createElement("div");
      body.className = "batch-card-body";
      body.style.display = idx === 0 ? "" : "none";

      const kindFieldsRoot = document.createElement("div");
      const metaFieldsRoot = document.createElement("div");
      body.append(kindFieldsRoot, metaFieldsRoot);

      section.append(head, body);
      list.append(section);

      const entry: CardEntry = {
        section,
        fields: renderFields(opts.kind, draft, kindFieldsRoot, metaFieldsRoot, allTags, "table"),
        discarded: false,
      };
      entries.push(entry);

      function toggle(): void {
        const open = body.style.display === "none";
        body.style.display = open ? "" : "none";
        chevron.textContent = open ? "▾" : "▸";
        if (open) {
          setTimeout(() => {
            const tas = Array.from(body.querySelectorAll("textarea"));
            tas.forEach((ta) => {
              ta.dispatchEvent(new Event("input", { bubbles: true }));
            });
          }, 0);
        }
      }

      chevron.addEventListener("click", (e) => {
        e.stopPropagation();
        toggle();
      });
      summary.addEventListener("click", toggle);

      discard.addEventListener("click", (e) => {
        e.stopPropagation();
        entry.discarded = true;
        section.remove();
        refreshCount();
      });

      // Per-card AI editor. `card:` is this section, so every field lookup and
      // diff pill stays inside this card rather than hitting card #1's fields.
      initAIEditor({
        shadow,
        card: section,
        backdrop,
        opts: { kind: opts.kind, source: opts.source },
        allTags,
        kindFieldsRoot,
        metaFieldsRoot,
        aiBtn,
        optionsLayout: "table",
        getFields: () => entry.fields,
        setFields: (next) => {
          entry.fields = next;
        },
      });
    });

    refreshCount();

    function cleanup(): void {
      document.removeEventListener("keydown", onKeydown, true);
      host.remove();
    }

    function doSave(): void {
      const cards = kept().map((e) => draftToCard(e.fields.readValues(), opts.source));
      cleanup();
      resolve({ action: "save", cards, groupName: groupName || undefined });
    }

    function doCancel(): void {
      cleanup();
      resolve({ action: "cancel" });
    }

    function onKeydown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        doCancel();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (kept().length > 0) doSave();
      }
    }

    cancelBtn.addEventListener("click", doCancel);
    saveBtn.addEventListener("click", () => {
      if (kept().length > 0) doSave();
    });
    document.addEventListener("keydown", onKeydown, true);

    document.body.append(host);

    // Initial resize trigger for the first card which is expanded by default
    setTimeout(() => {
      const tas = Array.from(shadow.querySelectorAll("textarea"));
      tas.forEach((ta) => {
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }, 50);
  });
}
