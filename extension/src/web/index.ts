import type { CardDraft, GenerateResponse, SaveCardsResult } from "../shared/types";
import { createStatusPill } from "../content/status";
import { showToast } from "../content/toast";
import { openBatchOverlay } from "../content/overlay/batch";
import { openConfigModal, type QuestionConfig } from "./config-modal";
import { buildWebSource, readSelection } from "./selection";

const CONFIG_KEY = "lastQuestionConfig";

async function lastConfig(): Promise<QuestionConfig | undefined> {
  try {
    const stored = (await chrome.storage.local.get(CONFIG_KEY))[CONFIG_KEY] as QuestionConfig | undefined;
    return stored;
  } catch {
    return undefined;
  }
}

async function runAddQuestion(): Promise<void> {
  const snap = readSelection(window, document);
  if (!snap) {
    showToast("Select some text first", true);
    return;
  }

  const config = await openConfigModal(snap.text, await lastConfig());
  if (!config) return;
  void chrome.storage.local.set({ [CONFIG_KEY]: config });

  const status = createStatusPill();
  status.set("generating", `Generating ${config.count} card${config.count === 1 ? "" : "s"}…`);

  const res = (await chrome.runtime.sendMessage({
    type: "GENERATE_QUESTIONS",
    req: {
      text: snap.text,
      kind: config.kind,
      count: config.count,
      pageTitle: snap.title,
      pageUrl: snap.url,
    },
  })) as GenerateResponse;

  if (!res?.ok || !res.drafts) {
    status.set("error", res?.error ?? "Generation failed");
    return;
  }
  const drafts: CardDraft[] = res.drafts;
  if (drafts.length === 0) {
    status.set("error", "The model found nothing to make cards from");
    return;
  }

  status.set("ready", `${drafts.length} card${drafts.length === 1 ? "" : "s"} ready — review below`);

  const allTags = (await chrome.runtime.sendMessage({ type: "GET_TAGS" }).catch(() => [])) as {
    id: string;
    name: string;
  }[];

  const result = await openBatchOverlay({
    kind: config.kind,
    drafts,
    source: buildWebSource(snap),
    allTags: Array.isArray(allTags) ? allTags : [],
    groupName: res.groupName,
  });

  if (result.action !== "save") {
    status.remove();
    return;
  }

  status.set("saving", `Saving ${result.cards.length}…`);
  const saveRes = (await chrome.runtime.sendMessage({
    type: "SAVE_CARDS",
    cards: result.cards,
    groupName: result.groupName,
  })) as SaveCardsResult;

  if (saveRes.queued > 0) {
    status.set("queued", `Saved ${saveRes.saved} · ${saveRes.queued} queued (server offline)`);
  } else {
    status.set("saved", `Saved ${saveRes.saved} ✓`);
  }
}

// Guard so the service worker can re-inject this script into a tab that was
// already open when the extension loaded, without double-registering.
const w = window as unknown as { __recallWebLoaded?: boolean };
if (!w.__recallWebLoaded) {
  w.__recallWebLoaded = true;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "OPEN_QUESTION_MODAL") {
      void runAddQuestion();
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });
}
