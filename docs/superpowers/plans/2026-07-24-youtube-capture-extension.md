# YouTube Capture Extension + Recall Capture Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome MV3 extension (built inside the Recall repo) that captures a YouTube video frame on a per-card-kind hotkey, AI-drafts a full Recall card from the frame, lets the user review/edit it in an in-page overlay, and saves it into Recall — with per-kind timeline markers and a lazy screenshot-reveal in Recall's card views.

**Architecture:** The extension (Vite + TS, no framework, patterned on `D:\code\personal_projects\clipper\extension` which is REFERENCE ONLY) captures the frame and calls two Recall API routes: `POST /api/capture` (Gemini OCR + full-card draft + R2 upload → returns an unsaved draft) and `POST /api/cards` (extended to accept `source` metadata → persists). Recall stores card `source` (videoId, url, timestamp, channel, screenshotUrl, marker). Markers render on the YouTube progress bar from `GET /api/cards?videoId=`. Recall's Test/Result/Cards views gain a lazy "Show frame" button.

**Tech Stack:** Next.js 16 (Recall), MongoDB Atlas via `readDb`/`writeDb`, `@google/genai` (Gemini 2.5 Flash-Lite — copied from clipper), `@aws-sdk/client-s3` (Cloudflare R2), Chrome Manifest V3, Vite, TypeScript, Vitest.

## Global Constraints

- Recall app conventions per `recall/CLAUDE.md` + `recall/AGENTS.md`: this is **not** stock Next.js — check `node_modules/next/dist/docs/` before touching routing; dynamic params are `Promise<{…}>` and must be awaited.
- Data access ONLY through `lib/db.ts` `readDb<T>(name)` / `writeDb<T>(name, data)`; never a raw driver call in a component. Route handlers reading data export `dynamic = "force-dynamic"`.
- `SessionResult.correct` stays a single boolean across kinds. `Card.id` is `crypto.randomUUID()`; `_id` never leaks.
- Recall UI is hand-rolled Tailwind v4 (no shadcn/RHF/Zod), toasts via `useToast()`, skeletons not spinners. Match it. (Recall's `instructions.md` names shadcn but the codebase does not use it — follow the code.)
- **Money guardrail (`instructions.md`): ALWAYS ask permission before any live Vertex/Gemini call — it costs money. The user smoke-tests all real captures manually.** So: every automated step in this plan mocks Gemini (see A3/A4 tests); no agent runs the real API. The design uses Gemini for drafting, but wiring/tests must never spend without explicit approval. Gemini creds via `GEMINI_API_KEY` or `service-account.json` (Vertex ADC), same detection as clipper.
- Card kinds & shortcuts (defaults, all user-configurable in the options page; validated to avoid Chrome/YouTube reserved combos):
  `quiz`→`mcq` = `Alt+Shift+Q`, `flash` = `Alt+Shift+F`, `cloze` = `Alt+Shift+C`, `tf-sort` = `Alt+Shift+T`, `match` = `Alt+Shift+M`.
- Per-kind marker defaults (shape, color): mcq = circle `#f59e0b`, flash = square `#3b82f6`, cloze = triangle `#a855f7`, tf-sort = diamond `#10b981`, match = star `#ec4899`.
- Extension base URL is a **setting** (`chrome.storage.sync`), default `http://localhost:3000`; the Recall server it points at writes to Atlas. Local mirror refreshed with `npm run sync:local`.
- Commits: author = the user only, **no** Co-Authored-By trailer.
- Verify with `npx tsc --noEmit`, `npm run lint`, `npx vitest run` (Recall) and `pnpm --dir extension test` / `vitest` (extension). No prod build unless asked.

---

## File Structure

**Recall backend/UI (new):**
- `lib/storage.ts` — R2 upload helper (single S3 client, `uploadFrame(dataUrl) → url`).
- `lib/gemini.ts` — Gemini client + `draftCardFromFrame(imageBase64, kind) → CardDraft`.
- `types/capture.ts` — `CardSource`, `CardDraft`, `CaptureRequest`, `CaptureResponse`.
- `app/api/capture/route.ts` — `POST`: OCR+draft+R2, returns unsaved draft. `force-dynamic`.
- `components/CardFrame.tsx` — lazy "Show frame" reveal button + image.

**Recall backend/UI (modified):**
- `types/index.ts` — add `source?: CardSource` to `Card`.
- `app/api/cards/validate.ts` — pass `source` through `buildCardFromInput`.
- `app/api/cards/route.ts` — `GET` supports `?videoId=` returning marker rows.
- `app/test/session/TestSession.tsx`, `app/test/result/ResultView.tsx`, `app/cards/CardsBrowser.tsx` — mount `<CardFrame>`.
- `lib/export.ts` — carry `source` on export (round-trip).
- `.env.local.example` — add `GEMINI_API_KEY`, `GEMINI_OCR_MODEL`, `R2_*`.
- `package.json` — add `@google/genai`, `@aws-sdk/client-s3`.

**Extension (new workspace `recall/extension/`):**
- `extension/package.json`, `extension/vite.config.ts`, `extension/tsconfig.json`, `extension/copy-static.mjs` — build (mirror clipper's).
- `extension/manifest.json` — MV3: content script on youtube.com, options page, popup, `storage`/`tabs`/`alarms` perms, host perms `<all_urls>` (base URL configurable).
- `extension/src/shared/types.ts` — shared message/config types.
- `extension/src/shared/config.ts` — load/save settings (`chrome.storage.sync`) with defaults.
- `extension/src/background.ts` — API calls, offline queue, message routing.
- `extension/src/content/index.ts` — hotkey listener (from config), capture orchestration.
- `extension/src/content/capture.ts` — frame → dataURL (canvas).
- `extension/src/content/metadata.ts` — video id/title/channel/thumbnail.
- `extension/src/content/markers.ts` — per-kind shape/color markers + visibility filter.
- `extension/src/content/overlay/overlay.ts` — overlay shell (frame, tags, save/undo/AI-rephrase, kind-agnostic chrome).
- `extension/src/content/overlay/fields-*.ts` — per-kind field editors (`mcq`, `flash`, `cloze`, `tfsort`, `match`).
- `extension/src/options/options.html` + `options.ts` — configure shortcuts, markers, base URL, kind visibility.
- `extension/src/popup/popup.html` + `popup.ts` — quick show/hide-by-kind toggles + link to options.
- `extension/tests/*.test.ts` — config, capture, markers, overlay draft-mapping.

---

## PHASE A — Recall capture backend

### Task A1: Card `source` type + validator passthrough

**Files:**
- Modify: `types/index.ts` (add `CardSource` + `Card.source`)
- Create: `types/capture.ts`
- Modify: `app/api/cards/validate.ts:46-53` (thread `source` into `baseCard`)
- Test: `app/api/cards/validate.test.ts` (create)

**Interfaces:**
- Produces: `CardSource = { videoId: string; url: string; timestamp: number; channel?: string; title?: string; screenshotUrl?: string; marker?: { shape: MarkerShape; color: string } }`; `MarkerShape = "circle"|"square"|"triangle"|"diamond"|"star"`. `buildCardFromInput` now copies `body.source` onto the returned card when present and shaped correctly.

- [ ] **Step 1: Write the failing test**

```ts
// app/api/cards/validate.test.ts
import { expect, test } from "vitest";
import { buildCardFromInput } from "@/app/api/cards/validate";

test("passes through a well-formed source", () => {
  const { card, error } = buildCardFromInput({
    kind: "mcq", question: "Q", answer: "A", distractors: ["b", "c", "d"],
    source: { videoId: "abc", url: "https://youtu.be/abc", timestamp: 12.5,
      channel: "Chan", title: "T", screenshotUrl: "https://r2/x.png",
      marker: { shape: "circle", color: "#f59e0b" } },
  });
  expect(error).toBeUndefined();
  expect(card!.source).toEqual({
    videoId: "abc", url: "https://youtu.be/abc", timestamp: 12.5,
    channel: "Chan", title: "T", screenshotUrl: "https://r2/x.png",
    marker: { shape: "circle", color: "#f59e0b" },
  });
});

test("omits source when absent", () => {
  const { card } = buildCardFromInput({ kind: "flash", question: "Q", answer: "A" });
  expect(card!.source).toBeUndefined();
});

test("drops a malformed source (missing videoId)", () => {
  const { card } = buildCardFromInput({
    kind: "flash", question: "Q", answer: "A",
    source: { url: "x", timestamp: 1 },
  });
  expect(card!.source).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npx vitest run app/api/cards/validate.test.ts` — Expected: FAIL (`source` not on card).

- [ ] **Step 3: Add the type.** In `types/index.ts` add:

```ts
export type MarkerShape = "circle" | "square" | "triangle" | "diamond" | "star";

export interface CardSource {
  videoId: string;
  url: string;
  timestamp: number;
  channel?: string;
  title?: string;
  screenshotUrl?: string;
  marker?: { shape: MarkerShape; color: string };
}
```

Add `source?: CardSource;` to the `Card` interface (after `createdAt`). Create `types/capture.ts`:

```ts
import type { CardKind, MarkerShape } from "@/types";

export interface CardDraft {
  kind: CardKind;
  question: string;
  answer: string;
  distractors: string[];
  statements?: { text: string; isTrue: boolean }[];
  pairs?: { left: string; right: string }[];
  clozeText?: string;
  explanation: string;
  hint: string;
  tags: string[];
}

export interface CaptureRequest {
  kind: CardKind;
  videoId: string;
  url: string;
  title: string;
  channel: string;
  timestamp: number;
  frameDataUrl: string; // "data:image/png;base64,..."
}

export interface CaptureResponse {
  ok: boolean;
  draft?: CardDraft;
  ocrText?: string;
  screenshotUrl?: string;
  marker?: { shape: MarkerShape; color: string };
  error?: string;
}
```

- [ ] **Step 4: Thread `source` through the validator.** In `app/api/cards/validate.ts`, add a normalizer and include it in `baseCard`:

```ts
import type { Card, CardKind, TfStatement, MatchPair, CardSource, MarkerShape } from "@/types";

const SHAPES: MarkerShape[] = ["circle", "square", "triangle", "diamond", "star"];

function normalizeSource(raw: unknown): CardSource | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.videoId !== "string" || !o.videoId) return undefined;
  if (typeof o.url !== "string" || typeof o.timestamp !== "number") return undefined;
  const src: CardSource = { videoId: o.videoId, url: o.url, timestamp: o.timestamp };
  if (typeof o.channel === "string") src.channel = o.channel;
  if (typeof o.title === "string") src.title = o.title;
  if (typeof o.screenshotUrl === "string") src.screenshotUrl = o.screenshotUrl;
  const m = o.marker as Record<string, unknown> | undefined;
  if (m && SHAPES.includes(m.shape as MarkerShape) && typeof m.color === "string") {
    src.marker = { shape: m.shape as MarkerShape, color: m.color };
  }
  return src;
}
```

Then in `baseCard` add: `source: normalizeSource(body.source),` and change the `baseCard` object literal's type comment is unaffected (it's inferred). Because `source` is optional, the three malformed/absent cases resolve to `undefined`.

- [ ] **Step 5: Run test to verify it passes** — Run: `npx vitest run app/api/cards/validate.test.ts` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add types/index.ts types/capture.ts app/api/cards/validate.ts app/api/cards/validate.test.ts
git commit -m "feat(cards): add optional source (video/frame) metadata to Card"
```

---

### Task A2: R2 storage helper

**Files:**
- Create: `lib/storage.ts`
- Modify: `.env.local.example`, `package.json` (dep)
- Test: `lib/storage.test.ts`

**Interfaces:**
- Produces: `uploadFrame(dataUrl: string, keyPrefix?: string): Promise<string>` → returns public URL `${R2_PUBLIC_BASE_URL}/${key}`. `parseDataUrl(dataUrl) → { buffer: Buffer; contentType: string }` (exported for testing).

- [ ] **Step 1: Add dependency** — Run: `npm install @aws-sdk/client-s3`.

- [ ] **Step 2: Write the failing test**

```ts
// lib/storage.test.ts
import { expect, test } from "vitest";
import { parseDataUrl } from "@/lib/storage";

test("parseDataUrl splits mime + bytes", () => {
  // 1x1 transparent PNG
  const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const { buffer, contentType } = parseDataUrl(`data:image/png;base64,${b64}`);
  expect(contentType).toBe("image/png");
  expect(buffer.length).toBeGreaterThan(10);
});

test("parseDataUrl rejects non-data URLs", () => {
  expect(() => parseDataUrl("https://x/y.png")).toThrow();
});
```

- [ ] **Step 3: Run test to verify it fails** — Run: `npx vitest run lib/storage.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 4: Implement `lib/storage.ts`**

```ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

let client: S3Client | null = null;
function r2(): S3Client {
  if (client) return client;
  const accountId = process.env.R2_ACCOUNT_ID!;
  client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return client;
}

export function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) throw new Error("not a base64 data URL");
  return { contentType: m[1], buffer: Buffer.from(m[2], "base64") };
}

export async function uploadFrame(dataUrl: string, keyPrefix = "frames"): Promise<string> {
  const { buffer, contentType } = parseDataUrl(dataUrl);
  const ext = contentType.split("/")[1] ?? "png";
  const key = `${keyPrefix}/${randomUUID()}.${ext}`;
  await r2().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return `${process.env.R2_PUBLIC_BASE_URL}/${key}`;
}
```

- [ ] **Step 5: Run test to verify it passes** — Run: `npx vitest run lib/storage.test.ts` — Expected: PASS (no network — only `parseDataUrl` is tested).

- [ ] **Step 6: Document env.** Append to `.env.local.example`:

```
# Cloudflare R2 (frame screenshots)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=
```

- [ ] **Step 7: Commit**

```bash
git add lib/storage.ts lib/storage.test.ts .env.local.example package.json package-lock.json
git commit -m "feat(storage): add Cloudflare R2 frame upload helper"
```

---

### Task A3: Gemini card-draft helper

**Files:**
- Create: `lib/gemini.ts`
- Modify: `.env.local.example`, `package.json` (dep)
- Test: `lib/gemini.test.ts` (pure `parseDraft` only — no network)

**Interfaces:**
- Consumes: `CardDraft`, `CardKind` from `types/capture` / `types`.
- Produces: `draftCardFromFrame(frameDataUrl: string, kind: CardKind): Promise<{ draft: CardDraft; ocrText: string }>`; `parseDraft(raw: string, kind: CardKind): CardDraft` (exported, pure, defensive JSON parse with per-kind fallback).

- [ ] **Step 1: Add dependency** — Run: `npm install @google/genai`.

- [ ] **Step 2: Write the failing test**

```ts
// lib/gemini.test.ts
import { expect, test } from "vitest";
import { parseDraft } from "@/lib/gemini";

test("parseDraft reads a fenced JSON mcq draft", () => {
  const raw = "```json\n" + JSON.stringify({
    question: "Big-O of binary search?", answer: "O(log n)",
    distractors: ["O(n)", "O(1)", "O(n log n)"], tags: ["algorithms"],
    explanation: "Halves the range each step.", hint: "Divide and conquer",
  }) + "\n```";
  const d = parseDraft(raw, "mcq");
  expect(d.kind).toBe("mcq");
  expect(d.answer).toBe("O(log n)");
  expect(d.distractors).toHaveLength(3);
  expect(d.tags).toContain("algorithms");
});

test("parseDraft on garbage returns an empty draft of the kind", () => {
  const d = parseDraft("sorry I cannot", "cloze");
  expect(d.kind).toBe("cloze");
  expect(d.clozeText).toBe("");
  expect(d.tags).toEqual([]);
});
```

- [ ] **Step 3: Run test to verify it fails** — Run: `npx vitest run lib/gemini.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 4: Implement `lib/gemini.ts`.** Prompts are per-kind; `parseDraft` is defensive.

```ts
import { GoogleGenAI } from "@google/genai";
import type { CardKind } from "@/types";
import type { CardDraft } from "@/types/capture";

const MODEL = process.env.GEMINI_OCR_MODEL ?? "gemini-2.5-flash-lite";

// Vertex ADC (service-account.json) OR GEMINI_API_KEY — same detection as clipper.
let ai: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (ai) return ai;
  ai = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1" });
  return ai;
}

const KIND_INSTRUCTIONS: Record<CardKind, string> = {
  mcq: `Produce a single multiple-choice question. JSON keys: question, answer (the ONE correct option), distractors (exactly 3 plausible wrong options), tags (2-4 lowercase topic tags), explanation, hint.`,
  flash: `Produce a flashcard. JSON keys: question (front), answer (back), tags, explanation, hint.`,
  cloze: `Produce a cloze-deletion card. JSON keys: clozeText (one sentence with 1-3 blanks written as ==answer==), tags, explanation, hint.`,
  "tf-sort": `Produce a true/false sorting card. JSON keys: question (the instruction), statements (array of >=4 objects {text, isTrue}), tags, explanation, hint.`,
  match: `Produce a match-the-pairs card. JSON keys: question (instruction), pairs (array of >=3 objects {left, right}), tags, explanation, hint.`,
};

function emptyDraft(kind: CardKind): CardDraft {
  return { kind, question: "", answer: "", distractors: [], tags: [], explanation: "", hint: "",
    ...(kind === "cloze" ? { clozeText: "" } : {}),
    ...(kind === "tf-sort" ? { statements: [] } : {}),
    ...(kind === "match" ? { pairs: [] } : {}) };
}

export function parseDraft(raw: string, kind: CardKind): CardDraft {
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const jsonText = (fence ? fence[1] : raw).trim();
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(jsonText);
  } catch {
    const braces = /\{[\s\S]*\}/.exec(jsonText);
    try { obj = braces ? JSON.parse(braces[0]) : {}; } catch { return emptyDraft(kind); }
  }
  const base = emptyDraft(kind);
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  base.question = s(obj.question);
  base.answer = s(obj.answer);
  base.explanation = s(obj.explanation);
  base.hint = s(obj.hint);
  base.tags = arr(obj.tags).map((t) => s(t).toLowerCase().trim()).filter(Boolean).slice(0, 4);
  base.distractors = arr(obj.distractors).map(s).filter(Boolean).slice(0, 3);
  if (kind === "cloze") base.clozeText = s(obj.clozeText);
  if (kind === "tf-sort") base.statements = arr(obj.statements)
    .map((x) => ({ text: s((x as Record<string, unknown>)?.text), isTrue: Boolean((x as Record<string, unknown>)?.isTrue) }))
    .filter((x) => x.text);
  if (kind === "match") base.pairs = arr(obj.pairs)
    .map((x) => ({ left: s((x as Record<string, unknown>)?.left), right: s((x as Record<string, unknown>)?.right) }))
    .filter((x) => x.left && x.right);
  return base;
}

export async function draftCardFromFrame(frameDataUrl: string, kind: CardKind): Promise<{ draft: CardDraft; ocrText: string }> {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(frameDataUrl);
  if (!m) throw new Error("bad frame data URL");
  const prompt = `You are turning a single screenshot from an educational video into ONE revision card.
First transcribe all readable text in the image (this is the OCR). Then write the card.
${KIND_INSTRUCTIONS[kind]}
Return ONLY a JSON object with the card keys above PLUS an "ocrText" key holding the raw transcription. No prose.`;
  const res = await client().models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [
      { text: prompt },
      { inlineData: { mimeType: m[1], data: m[2] } },
    ] }],
  });
  const text = res.text ?? "";
  const draft = parseDraft(text, kind);
  let ocrText = "";
  try {
    const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
    const obj = JSON.parse((fence ? fence[1] : text).trim());
    ocrText = typeof obj.ocrText === "string" ? obj.ocrText : "";
  } catch { /* ocrText optional */ }
  return { draft, ocrText };
}
```

- [ ] **Step 5: Run test to verify it passes** — Run: `npx vitest run lib/gemini.test.ts` — Expected: PASS.

- [ ] **Step 6: Document env.** Append to `.env.local.example`:

```
# Gemini (card drafting from frames)
GEMINI_API_KEY=
GEMINI_OCR_MODEL=gemini-2.5-flash-lite
# OR Vertex ADC:
GOOGLE_CLOUD_PROJECT=
GOOGLE_CLOUD_LOCATION=us-central1
```

- [ ] **Step 7: Commit**

```bash
git add lib/gemini.ts lib/gemini.test.ts .env.local.example package.json package-lock.json
git commit -m "feat(gemini): draft a full card of any kind from a video frame"
```

---

### Task A4: `POST /api/capture` route

**Files:**
- Create: `app/api/capture/route.ts`
- Test: `app/api/capture/route.test.ts` (mocks `lib/gemini` + `lib/storage`)

**Interfaces:**
- Consumes: `draftCardFromFrame`, `uploadFrame`, `CaptureRequest`, `CaptureResponse`, per-kind marker defaults.
- Produces: `POST /api/capture` accepting `CaptureRequest` → `CaptureResponse` (`draft`, `ocrText`, `screenshotUrl`, `marker`). Does NOT persist a card.

- [ ] **Step 1: Write the failing test**

```ts
// app/api/capture/route.test.ts
import { expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/gemini", () => ({
  draftCardFromFrame: vi.fn(async () => ({
    draft: { kind: "mcq", question: "Q", answer: "A", distractors: ["b","c","d"], tags: ["t"], explanation: "", hint: "" },
    ocrText: "raw text",
  })),
}));
vi.mock("@/lib/storage", () => ({ uploadFrame: vi.fn(async () => "https://r2/frame.png") }));

import { POST } from "@/app/api/capture/route";

function req(body: unknown) {
  return new Request("http://localhost/api/capture", { method: "POST", body: JSON.stringify(body) }) as never;
}

beforeEach(() => vi.clearAllMocks());

test("returns a draft, screenshot url, and kind marker", async () => {
  const res = await POST(req({
    kind: "mcq", videoId: "abc", url: "u", title: "t", channel: "c",
    timestamp: 5, frameDataUrl: "data:image/png;base64,AAAA",
  }));
  const json = await res.json();
  expect(res.status).toBe(200);
  expect(json.ok).toBe(true);
  expect(json.draft.answer).toBe("A");
  expect(json.screenshotUrl).toBe("https://r2/frame.png");
  expect(json.marker).toEqual({ shape: "circle", color: "#f59e0b" });
});

test("400 on missing frame", async () => {
  const res = await POST(req({ kind: "mcq", videoId: "abc", url: "u", title: "t", channel: "c", timestamp: 5 }));
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npx vitest run app/api/capture/route.test.ts` — Expected: FAIL (route missing).

- [ ] **Step 3: Implement `app/api/capture/route.ts`**

```ts
import { NextRequest } from "next/server";
import type { CaptureRequest, CaptureResponse } from "@/types/capture";
import type { CardKind, MarkerShape } from "@/types";
import { draftCardFromFrame } from "@/lib/gemini";
import { uploadFrame } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MARKER: Record<CardKind, { shape: MarkerShape; color: string }> = {
  mcq: { shape: "circle", color: "#f59e0b" },
  flash: { shape: "square", color: "#3b82f6" },
  cloze: { shape: "triangle", color: "#a855f7" },
  "tf-sort": { shape: "diamond", color: "#10b981" },
  match: { shape: "star", color: "#ec4899" },
};

export async function POST(req: NextRequest): Promise<Response> {
  const body = (await req.json()) as Partial<CaptureRequest>;
  if (!body.frameDataUrl || !body.kind || !body.videoId) {
    return Response.json({ ok: false, error: "frameDataUrl, kind, videoId required" } satisfies CaptureResponse, { status: 400 });
  }
  try {
    const [{ draft, ocrText }, screenshotUrl] = await Promise.all([
      draftCardFromFrame(body.frameDataUrl, body.kind),
      uploadFrame(body.frameDataUrl),
    ]);
    return Response.json({ ok: true, draft, ocrText, screenshotUrl, marker: MARKER[body.kind] } satisfies CaptureResponse);
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "capture failed" } satisfies CaptureResponse, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npx vitest run app/api/capture/route.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/capture/route.ts app/api/capture/route.test.ts
git commit -m "feat(api): POST /api/capture — draft a card + store frame, no persist"
```

---

### Task A5: `GET /api/cards?videoId=` marker rows

**Files:**
- Modify: `app/api/cards/route.ts:7-12`
- Test: `app/api/cards/route.test.ts` (create; in-memory replset like `lib/reviews.test.ts`)

**Interfaces:**
- Produces: `GET /api/cards?videoId=abc` → `{ id, kind, timestamp, marker }[]` (only cards whose `source.videoId === abc`), so the extension renders markers without downloading full cards.

- [ ] **Step 1: Write the failing test** (mirror `lib/reviews.test.ts` mongo setup; seed two cards, one with `source.videoId="abc"`).

```ts
// app/api/cards/route.test.ts
import { beforeAll, afterAll, beforeEach, expect, test } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { writeDb, resetDbForTests } from "@/lib/db";
import { GET } from "@/app/api/cards/route";
import type { Card } from "@/types";

let mongo: MongoMemoryReplSet;
beforeAll(async () => {
  await resetDbForTests();
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "recall_cards_test";
});
afterAll(async () => { await resetDbForTests(); await mongo.stop(); });
beforeEach(() => writeDb("cards.json", []));

function req(qs: string) {
  return { nextUrl: new URL(`http://localhost/api/cards${qs}`) } as never;
}

test("videoId filter returns marker rows only", async () => {
  const cards: Card[] = [
    { id: "1", kind: "mcq", question: "Q", answer: "A", distractors: ["b","c","d"], explanation: "", hint: "", difficulty: 3, tags: [], createdAt: "",
      source: { videoId: "abc", url: "u", timestamp: 10, marker: { shape: "circle", color: "#f59e0b" } } },
    { id: "2", kind: "flash", question: "Q2", answer: "A2", distractors: [], explanation: "", hint: "", difficulty: 3, tags: [], createdAt: "" },
  ];
  await writeDb("cards.json", cards);
  const res = await GET(req("?videoId=abc"));
  const rows = await res.json();
  expect(rows).toEqual([{ id: "1", kind: "mcq", timestamp: 10, marker: { shape: "circle", color: "#f59e0b" } }]);
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npx vitest run app/api/cards/route.test.ts` — Expected: FAIL (returns full cards, not rows).

- [ ] **Step 3: Implement.** Replace `GET` in `app/api/cards/route.ts`:

```ts
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const tag = params.get("tag");
  const videoId = params.get("videoId");
  const cards = await readDb<Card>("cards.json");
  if (videoId) {
    return Response.json(
      cards
        .filter((c) => c.source?.videoId === videoId)
        .map((c) => ({ id: c.id, kind: c.kind ?? "mcq", timestamp: c.source!.timestamp, marker: c.source!.marker })),
    );
  }
  const filtered = tag ? cards.filter((c) => c.tags.includes(tag)) : cards;
  return Response.json(filtered);
}
```

(Add `export const dynamic = "force-dynamic";` if not already present.)

- [ ] **Step 4: Run test to verify it passes** — Run: `npx vitest run app/api/cards/route.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/cards/route.ts app/api/cards/route.test.ts
git commit -m "feat(api): GET /api/cards?videoId= returns marker rows"
```

---

### Task A6: Export round-trip for `source`

**Files:**
- Modify: `lib/export.ts`
- Test: `lib/export.test.ts` (extend if present, else create)

**Interfaces:**
- Produces: `ExportedCard.source?: CardSource` carried on export so bundle export→import preserves capture provenance.

- [ ] **Step 1: Write the failing test**

```ts
// lib/export.test.ts (add)
import { expect, test } from "vitest";
import { toExportedCard } from "@/lib/export";
import type { Card } from "@/types";

test("export preserves source", () => {
  const card = { id: "1", kind: "flash", question: "Q", answer: "A", distractors: [], explanation: "", hint: "", difficulty: 3, tags: [], createdAt: "",
    source: { videoId: "abc", url: "u", timestamp: 3 } } as Card;
  expect(toExportedCard(card).source).toEqual({ videoId: "abc", url: "u", timestamp: 3 });
});
```

(If `lib/export.ts` has no `toExportedCard` export, adapt the test to the actual exported mapper name found in that file, and export a testable mapper.)

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run lib/export.test.ts` — Expected: FAIL.
- [ ] **Step 3: Add `source` to the exported card mapping** in `lib/export.ts` (include `source: card.source` on the emitted object; keep it omitted when undefined to match existing "small export" convention).
- [ ] **Step 4: Run to verify it passes** — Run: `npx vitest run lib/export.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/export.ts lib/export.test.ts
git commit -m "feat(export): round-trip card.source through export/import"
```

---

### Task A7: `<CardFrame>` lazy reveal + mount in Test/Result/Cards

**Files:**
- Create: `components/CardFrame.tsx`
- Modify: `app/test/session/TestSession.tsx`, `app/test/result/ResultView.tsx`, `app/cards/CardsBrowser.tsx`
- Test: `components/__tests__/card-frame.test.tsx`

**Interfaces:**
- Produces: `<CardFrame url?: string />` — renders nothing when `url` is falsy; otherwise a "Show frame" button that, on click, sets state and renders `<img src={url} loading="lazy" />` **below** the button (image requested only after click). Second click hides.

- [ ] **Step 1: Write the failing test**

```tsx
// components/__tests__/card-frame.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { expect, test } from "vitest";
import { CardFrame } from "@/components/CardFrame";

test("renders nothing without a url", () => {
  const { container } = render(<CardFrame url={undefined} />);
  expect(container).toBeEmptyDOMElement();
});

test("image is absent until the button is pressed", () => {
  render(<CardFrame url="https://r2/x.png" />);
  expect(screen.queryByRole("img")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /show frame/i }));
  const img = screen.getByRole("img") as HTMLImageElement;
  expect(img.getAttribute("src")).toBe("https://r2/x.png");
  fireEvent.click(screen.getByRole("button", { name: /hide frame/i }));
  expect(screen.queryByRole("img")).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run components/__tests__/card-frame.test.tsx` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement `components/CardFrame.tsx`**

```tsx
"use client";
import { useState } from "react";

export function CardFrame({ url }: { url?: string }) {
  const [shown, setShown] = useState(false);
  if (!url) return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="text-sm px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        {shown ? "Hide frame" : "Show frame"}
      </button>
      {shown && (
        <img
          src={url}
          loading="lazy"
          alt="Captured video frame"
          className="mt-2 rounded-lg border border-zinc-200 dark:border-zinc-800 max-w-full"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes** — Run: `npx vitest run components/__tests__/card-frame.test.tsx` — Expected: PASS.

- [ ] **Step 5: Mount it.**
  - `TestSession.tsx`: below the question block of the *current* card, render `<CardFrame url={card.source?.screenshotUrl} />`.
  - `ResultView.tsx`: in each missed-card row, after the correct-view block, render `<CardFrame url={card.source?.screenshotUrl} />`.
  - `CardsBrowser.tsx`: in the expanded/detail area of a card row (or under its summary), render `<CardFrame url={card.source?.screenshotUrl} />`.
  Import `CardFrame` in each. Keep placement consistent with each file's existing card layout.

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` — Expected: exit 0.

```bash
git add components/CardFrame.tsx components/__tests__/card-frame.test.tsx app/test/session/TestSession.tsx app/test/result/ResultView.tsx app/cards/CardsBrowser.tsx
git commit -m "feat(ui): lazy 'Show frame' reveal in test, result, and cards views"
```

---

## PHASE B — Extension scaffold + capture pipeline

> Reference (READ-ONLY, do not import): `D:\code\personal_projects\clipper\extension`. Copy build config + capture/metadata patterns; the card-kind + overlay + config logic is new.

### Task B1: Extension workspace + build

**Files:**
- Create: `extension/package.json`, `extension/vite.config.ts`, `extension/tsconfig.json`, `extension/copy-static.mjs`, `extension/manifest.json`, `extension/src/content/index.ts` (stub), `extension/src/background.ts` (stub), `extension/icons/icon128.png` (copy clipper's).

**Interfaces:**
- Produces: `pnpm --dir extension build` emits `extension/dist/{manifest.json,content.js,background.js,options.html,popup.html,icons/…}` loadable as an unpacked MV3 extension.

- [ ] **Step 1: Copy build scaffolding** from clipper: `extension/vite.config.ts`, `extension/tsconfig.json`, `extension/copy-static.mjs`, `extension/package.json` (rename to `recall-extension`). Ensure Vite builds `content`, `background`, `options`, `popup` entry points (extend clipper's config, which builds content+background, to add `options` and `popup` HTML entries).

- [ ] **Step 2: Write `extension/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Recall Capture",
  "version": "0.1.0",
  "description": "Capture YouTube frames into Recall cards (quiz/flash/cloze/tf-sort/match).",
  "icons": { "128": "icons/icon128.png" },
  "action": { "default_title": "Recall Capture", "default_popup": "popup.html" },
  "options_ui": { "page": "options.html", "open_in_tab": true },
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [
    { "matches": ["https://www.youtube.com/*"], "js": ["content.js"], "run_at": "document_idle" }
  ],
  "host_permissions": ["http://localhost:3000/*", "https://*/*"],
  "permissions": ["storage", "alarms", "tabs", "scripting"]
}
```

(No `commands` block — per-kind hotkeys are handled in the content script from config, because MV3 `commands` cap at 4 and aren't per-user-remappable at runtime.)

- [ ] **Step 3: Stub entry files** so the build succeeds: `content/index.ts` → `console.debug("recall capture loaded")`; `background.ts` → empty `chrome.runtime.onInstalled` listener; create empty `options.html`/`popup.html` + `options.ts`/`popup.ts` stubs.

- [ ] **Step 4: Build** — Run: `pnpm --dir extension install && pnpm --dir extension build` — Expected: `extension/dist/manifest.json` exists. Load unpacked in `chrome://extensions` to sanity-check (manual).

- [ ] **Step 5: Commit**

```bash
git add extension/ -- ':!extension/node_modules'
git commit -m "chore(extension): MV3 workspace scaffold + build"
```

---

### Task B2: Shared config (`chrome.storage.sync`)

**Files:**
- Create: `extension/src/shared/types.ts`, `extension/src/shared/config.ts`
- Test: `extension/tests/config.test.ts`

**Interfaces:**
- Produces: `CaptureKind = "mcq"|"flash"|"cloze"|"tf-sort"|"match"`; `KindConfig = { shortcut: string; marker: { shape: MarkerShape; color: string }; visible: boolean }`; `Settings = { baseUrl: string; kinds: Record<CaptureKind, KindConfig> }`; `DEFAULT_SETTINGS`; `loadSettings(): Promise<Settings>` (merges over defaults); `saveSettings(s): Promise<void>`; `matchShortcut(e: KeyboardEvent, shortcut: string): boolean` (parses `"Alt+Shift+Q"`).

- [ ] **Step 1: Write the failing test**

```ts
// extension/tests/config.test.ts
import { expect, test } from "vitest";
import { matchShortcut, DEFAULT_SETTINGS } from "../src/shared/config";

function key(opts: Partial<KeyboardEvent>): KeyboardEvent { return opts as KeyboardEvent; }

test("matchShortcut parses modifiers + key", () => {
  expect(matchShortcut(key({ altKey: true, shiftKey: true, key: "q" }), "Alt+Shift+Q")).toBe(true);
  expect(matchShortcut(key({ altKey: true, shiftKey: false, key: "q" }), "Alt+Shift+Q")).toBe(false);
  expect(matchShortcut(key({ altKey: true, shiftKey: true, key: "f" }), "Alt+Shift+Q")).toBe(false);
});

test("defaults cover all five kinds", () => {
  expect(Object.keys(DEFAULT_SETTINGS.kinds).sort()).toEqual(["cloze","flash","match","mcq","tf-sort"]);
  expect(DEFAULT_SETTINGS.kinds.mcq.shortcut).toBe("Alt+Shift+Q");
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `pnpm --dir extension exec vitest run tests/config.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `shared/types.ts` + `shared/config.ts`.**

```ts
// shared/types.ts
export type CaptureKind = "mcq" | "flash" | "cloze" | "tf-sort" | "match";
export type MarkerShape = "circle" | "square" | "triangle" | "diamond" | "star";
export interface KindConfig { shortcut: string; marker: { shape: MarkerShape; color: string }; visible: boolean }
export interface Settings { baseUrl: string; kinds: Record<CaptureKind, KindConfig> }
```

```ts
// shared/config.ts
import type { Settings, CaptureKind } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: "http://localhost:3000",
  kinds: {
    mcq:       { shortcut: "Alt+Shift+Q", marker: { shape: "circle",   color: "#f59e0b" }, visible: true },
    flash:     { shortcut: "Alt+Shift+F", marker: { shape: "square",   color: "#3b82f6" }, visible: true },
    cloze:     { shortcut: "Alt+Shift+C", marker: { shape: "triangle", color: "#a855f7" }, visible: true },
    "tf-sort": { shortcut: "Alt+Shift+T", marker: { shape: "diamond",  color: "#10b981" }, visible: true },
    match:     { shortcut: "Alt+Shift+M", marker: { shape: "star",     color: "#ec4899" }, visible: true },
  },
};

export async function loadSettings(): Promise<Settings> {
  const stored = (await chrome.storage.sync.get("settings")).settings as Partial<Settings> | undefined;
  return {
    baseUrl: stored?.baseUrl ?? DEFAULT_SETTINGS.baseUrl,
    kinds: { ...DEFAULT_SETTINGS.kinds, ...(stored?.kinds ?? {}) },
  };
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.sync.set({ settings: s });
}

export function matchShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split("+").map((p) => p.trim());
  const need = { ctrl: parts.includes("ctrl"), alt: parts.includes("alt"), shift: parts.includes("shift"), meta: parts.includes("meta") };
  const mainKey = parts[parts.length - 1];
  return (
    e.ctrlKey === need.ctrl && e.altKey === need.alt &&
    e.shiftKey === need.shift && e.metaKey === need.meta &&
    e.key.toLowerCase() === mainKey
  );
}

export const CAPTURE_KINDS: CaptureKind[] = ["mcq", "flash", "cloze", "tf-sort", "match"];
```

Add `vitest` to the extension dev deps + a `vitest.config.ts` if not present (jsdom not required for these; node env fine). Provide a minimal `chrome` global stub in `extension/tests/setup.ts` (`globalThis.chrome = { storage: { sync: { get: async()=>({}), set: async()=>{} } } } as never;`) referenced by `vitest.config.ts`.

- [ ] **Step 4: Run to verify it passes** — Run: `pnpm --dir extension exec vitest run tests/config.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/shared extension/tests/config.test.ts extension/tests/setup.ts extension/vitest.config.ts
git commit -m "feat(extension): shared settings + shortcut matcher"
```

---

### Task B3: Frame capture + metadata

**Files:**
- Create: `extension/src/content/capture.ts`, `extension/src/content/metadata.ts`
- Test: `extension/tests/metadata.test.ts` (port clipper's), `extension/tests/capture.test.ts`

**Interfaces:**
- Produces: `getPlayerVideo(): HTMLVideoElement | null`; `captureFrame(video): string` (canvas → `image/png` dataURL; throws if 0-size); `getPageMeta(location, document): { videoId, url, title, channel, thumbnailUrl } | null`; `extractVideoId(href): string | null`.

- [ ] **Step 1: Port + test metadata** — copy clipper's `metadata.ts` and its `tests/metadata.test.ts` (adapt import paths). Run: `pnpm --dir extension exec vitest run tests/metadata.test.ts` — Expected: PASS.

- [ ] **Step 2: Write failing capture test**

```ts
// extension/tests/capture.test.ts
import { expect, test, vi } from "vitest";
import { captureFrame } from "../src/content/capture";

test("captureFrame throws on a zero-size video", () => {
  const fake = { videoWidth: 0, videoHeight: 0 } as HTMLVideoElement;
  expect(() => captureFrame(fake)).toThrow();
});
```

- [ ] **Step 3: Run to verify it fails** — Run: `pnpm --dir extension exec vitest run tests/capture.test.ts` — Expected: FAIL.

- [ ] **Step 4: Implement `capture.ts`** (canvas draw; guard zero-size):

```ts
export function getPlayerVideo(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>(".html5-main-video, video");
}

export function captureFrame(video: HTMLVideoElement): string {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) throw new Error("video has no dimensions");
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}
```

- [ ] **Step 5: Run to verify it passes** — Run: `pnpm --dir extension exec vitest run tests/capture.test.ts` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add extension/src/content/capture.ts extension/src/content/metadata.ts extension/tests/metadata.test.ts extension/tests/capture.test.ts
git commit -m "feat(extension): frame capture + youtube metadata"
```

---

### Task B4: Background — capture + save API + offline queue

**Files:**
- Modify: `extension/src/background.ts`
- Test: `extension/tests/background.test.ts` (mock `fetch` + `chrome`)

**Interfaces:**
- Produces messages handled in `background.ts`:
  - `{ type: "CAPTURE", req: CaptureRequest }` → `POST {baseUrl}/api/capture` → `CaptureResponse`.
  - `{ type: "SAVE_CARD", card }` → `POST {baseUrl}/api/cards`; on network failure push to `chrome.storage.local` queue → `{ ok:false, queued:true }`.
  - `{ type: "GET_MARKERS", videoId }` → `GET {baseUrl}/api/cards?videoId=` → rows.
  - Alarm `flush-queue` (every 1 min) re-POSTs queued cards.
- Exposes pure helpers for test: `buildCaptureUrl(baseUrl)`, `buildCardsUrl(baseUrl)`.

- [ ] **Step 1: Write the failing test** (mock `global.fetch`; assert URL + body; assert queue on reject). Cover: CAPTURE forwards draft; SAVE_CARD queues on `fetch` reject.

```ts
// extension/tests/background.test.ts
import { expect, test, vi, beforeEach } from "vitest";
import { buildCaptureUrl, handleMessage } from "../src/background";

beforeEach(() => { vi.restoreAllMocks(); });

test("buildCaptureUrl joins base + path", () => {
  expect(buildCaptureUrl("http://localhost:3000")).toBe("http://localhost:3000/api/capture");
});

test("SAVE_CARD queues when fetch fails", async () => {
  const store: Record<string, unknown> = {};
  (globalThis as never as { chrome: unknown }).chrome = {
    storage: { local: { get: async () => ({ queue: store.queue ?? [] }), set: async (o: Record<string, unknown>) => Object.assign(store, o) },
               sync: { get: async () => ({ settings: undefined }) } },
  } as never;
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
  const res = await handleMessage({ type: "SAVE_CARD", card: { kind: "flash", question: "Q", answer: "A" } });
  expect(res).toEqual({ ok: false, queued: true });
  expect((store.queue as unknown[]).length).toBe(1);
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `pnpm --dir extension exec vitest run tests/background.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `background.ts`** — export `handleMessage`, `buildCaptureUrl`, `buildCardsUrl`; wire `chrome.runtime.onMessage`, `chrome.alarms`. (Full implementation: read settings for `baseUrl`, `fetch` with JSON, try/catch → queue; flush on alarm.) Keep functions pure where possible for testability.

- [ ] **Step 4: Run to verify it passes** — Run: `pnpm --dir extension exec vitest run tests/background.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/background.ts extension/tests/background.test.ts
git commit -m "feat(extension): background capture/save/markers + offline queue"
```

---

## PHASE C — Overlay, markers, options, popup

### Task C1: Per-kind markers with visibility filter

**Files:**
- Create: `extension/src/content/markers.ts`
- Test: `extension/tests/markers.test.ts`

**Interfaces:**
- Consumes: marker rows `{ id, kind, timestamp, marker }[]`, `Settings.kinds[kind].visible`.
- Produces: `renderMarkers(bar, rows, duration, settings, onSeek)` — draws one node per row using the kind's shape (CSS: circle=border-radius, square=none, triangle/diamond/star via `clip-path`) and color; **skips rows whose kind is `visible:false`**. `shapeCss(shape): string` exported pure.

- [ ] **Step 1: Write the failing test**

```ts
// extension/tests/markers.test.ts
import { expect, test } from "vitest";
import { shapeCss, filterVisible } from "../src/content/markers";
import { DEFAULT_SETTINGS } from "../src/shared/config";

test("triangle uses clip-path", () => {
  expect(shapeCss("triangle")).toContain("clip-path");
});
test("filterVisible drops hidden kinds", () => {
  const s = structuredClone(DEFAULT_SETTINGS); s.kinds.flash.visible = false;
  const rows = [{ id:"1", kind:"mcq", timestamp:1, marker:s.kinds.mcq.marker },
                { id:"2", kind:"flash", timestamp:2, marker:s.kinds.flash.marker }];
  expect(filterVisible(rows, s).map(r=>r.id)).toEqual(["1"]);
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `pnpm --dir extension exec vitest run tests/markers.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement `markers.ts`** with `shapeCss`, `filterVisible`, and DOM `renderMarkers` (extend clipper's marker DOM; swap fixed yellow dot for per-kind shape/color; add hover label showing kind + timestamp). Clip-paths: triangle `polygon(50% 0,0 100%,100% 100%)`, diamond `polygon(50% 0,100% 50%,50% 100%,0 50%)`, star (5-point polygon).
- [ ] **Step 4: Run to verify it passes** — Run: `pnpm --dir extension exec vitest run tests/markers.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add extension/src/content/markers.ts extension/tests/markers.test.ts
git commit -m "feat(extension): per-kind timeline markers + visibility filter"
```

---

### Task C2: Overlay shell + per-kind field editors

**Files:**
- Create: `extension/src/content/overlay/overlay.ts`, `extension/src/content/overlay/fields.ts`
- Test: `extension/tests/overlay.test.ts` (jsdom)

**Interfaces:**
- Consumes: `CaptureResponse.draft`, `screenshotUrl`, `marker`.
- Produces: `openOverlay(opts): Promise<{ action: "save"; card: object } | { action: "cancel" }>` where `opts = { draft, screenshotUrl, marker, source, onRephrase }`. `draftToCard(draft, source, screenshotUrl, marker): object` (pure — maps a `CardDraft` + provenance to the exact `/api/cards` POST body incl. `source`). `renderFields(kind, draft, root)` builds per-kind inputs and returns a `readValues()` getter.

- [ ] **Step 1: Write the failing test** (pure mapper is the high-value test):

```ts
// extension/tests/overlay.test.ts
import { expect, test } from "vitest";
import { draftToCard } from "../src/content/overlay/fields";

test("draftToCard builds a POST body with source", () => {
  const body = draftToCard(
    { kind: "mcq", question: "Q", answer: "A", distractors: ["b","c","d"], tags: ["t"], explanation: "e", hint: "h" },
    { videoId: "abc", url: "u", timestamp: 5, channel: "c", title: "t" },
    "https://r2/x.png",
    { shape: "circle", color: "#f59e0b" },
  );
  expect(body).toMatchObject({
    kind: "mcq", question: "Q", answer: "A", distractors: ["b","c","d"], tags: ["t"],
    source: { videoId: "abc", url: "u", timestamp: 5, channel: "c", title: "t",
      screenshotUrl: "https://r2/x.png", marker: { shape: "circle", color: "#f59e0b" } },
  });
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `pnpm --dir extension exec vitest run tests/overlay.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `fields.ts`** — `draftToCard` (pure mapper as tested) plus `renderFields(kind, draft, root)`:
  - **mcq:** question textarea, answer input, 3 distractor inputs.
  - **flash:** question (front) + answer (back) textareas.
  - **cloze:** single textarea bound to `clozeText` (help text: use `==answer==`).
  - **tf-sort:** question + a list of statement rows (text input + T/F toggle + remove + "add statement").
  - **match:** question + list of `{left,right}` pair rows (+ add/remove).
  - Always: a tags input (comma-separated, prefilled from `draft.tags`), explanation + hint textareas.
  `readValues()` returns the edited draft.

- [ ] **Step 4: Implement `overlay.ts`** — inject a fixed-position card `<div>` over the page (shadow DOM or a high `z-index` container with its own styles so YouTube CSS can't leak in). Contents top→bottom: kind badge, thumbnail of the captured frame (already have the dataURL — show it small at top of the *authoring* overlay; this is separate from the Recall-side lazy reveal), `renderFields(...)`, buttons: **Save**, **Cancel**, **Undo** (restores the original AI draft into the fields), **AI rephrase** (calls `opts.onRephrase(currentValues)` → replaces field values; keep a single-level undo stack). `Esc` cancels, `Ctrl+Enter` saves. Returns the promise resolving with `{action, card}`.

- [ ] **Step 5: Run to verify it passes** — Run: `pnpm --dir extension exec vitest run tests/overlay.test.ts` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add extension/src/content/overlay extension/tests/overlay.test.ts
git commit -m "feat(extension): review overlay + per-kind editors + draft->card mapper"
```

---

### Task C3: Wire content script end-to-end

**Files:**
- Modify: `extension/src/content/index.ts`
- Test: manual (integration) — documented steps.

**Interfaces:**
- Consumes: `loadSettings`, `matchShortcut`, `CAPTURE_KINDS`, `getPlayerVideo`, `captureFrame`, `getPageMeta`, `renderMarkers`, `openOverlay`, background messages.
- Behavior: on a matching hotkey → pause video, capture frame, add a provisional marker, message `CAPTURE`, open overlay with the returned draft; on Save → message `SAVE_CARD` → toast + refresh markers; on Cancel → remove provisional marker. `AI rephrase` in the overlay messages `CAPTURE` again (same frame) or a lighter `REPHRASE` — reuse `CAPTURE` with the same frame for simplicity.

- [ ] **Step 1: Implement `content/index.ts`.** Capture-phase `keydown` listener (like clipper) that loops `CAPTURE_KINDS`, and if `matchShortcut(e, settings.kinds[kind].shortcut)` fires, `preventDefault()` + run the capture flow for that kind. Guard against typing in inputs/contentEditable. Re-render markers on `yt-navigate-finish` and after save (call `GET_MARKERS`). Reload settings on `chrome.storage.onChanged`.

- [ ] **Step 2: Build** — Run: `pnpm --dir extension build` — Expected: exit 0, `dist/content.js` present.

- [ ] **Step 3: Manual integration check** (document in commit body): load unpacked, open a YouTube video with on-screen text, run Recall locally (`npm run dev`) with `GEMINI_API_KEY` + `R2_*` set, press `Alt+Shift+Q` → overlay shows an AI-drafted MCQ → edit → Save → card appears in Recall `/cards`; marker appears on the timeline; repeat for each kind + shortcut.

- [ ] **Step 4: Commit**

```bash
git add extension/src/content/index.ts
git commit -m "feat(extension): wire hotkey -> capture -> overlay -> save"
```

---

### Task C4: Options page (configure shortcuts, markers, base URL)

> **Settings open as a full page in a NEW browser tab**, not the small embedded panel. Achieved by `manifest.options_ui.open_in_tab: true` (Task B1) + opening via `chrome.runtime.openOptionsPage()`. Style `options.html` as a full-width page (max-width container, generous padding), not a cramped popup.

**Files:**
- Create: `extension/src/options/options.html`, `extension/src/options/options.ts`
- Test: `extension/tests/options-validate.test.ts`

**Interfaces:**
- Produces: `validateShortcut(shortcut: string, others: string[]): string | null` — rejects empty, duplicates, and reserved combos (`Ctrl+B`/`Ctrl+Shift+B` and common YouTube keys like bare `K/J/L/F/M`; require at least Alt or Ctrl+Shift). Options page reads/writes `Settings` via `loadSettings`/`saveSettings`.

- [ ] **Step 1: Write the failing test**

```ts
// extension/tests/options-validate.test.ts
import { expect, test } from "vitest";
import { validateShortcut } from "../src/options/options";

test("rejects a duplicate", () => {
  expect(validateShortcut("Alt+Shift+Q", ["Alt+Shift+Q"])).toMatch(/already/i);
});
test("rejects reserved Ctrl+B", () => {
  expect(validateShortcut("Ctrl+B", [])).toMatch(/reserved/i);
});
test("requires a modifier", () => {
  expect(validateShortcut("Q", [])).toMatch(/modifier/i);
});
test("accepts a good combo", () => {
  expect(validateShortcut("Alt+Shift+Z", ["Alt+Shift+Q"])).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `pnpm --dir extension exec vitest run tests/options-validate.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement `options.ts`** with `validateShortcut` + a form: per kind — shortcut text field, marker shape `<select>`, color `<input type=color>`, visible checkbox; plus a base-URL field; Save button persists via `saveSettings`. `options.html` is a minimal styled page.
- [ ] **Step 4: Run to verify it passes** — Run: `pnpm --dir extension exec vitest run tests/options-validate.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add extension/src/options extension/tests/options-validate.test.ts
git commit -m "feat(extension): options page — shortcuts, markers, base URL"
```

---

### Task C5: Toolbar popup (show/hide by kind)

**Files:**
- Create: `extension/src/popup/popup.html`, `extension/src/popup/popup.ts`
- Test: manual.

**Interfaces:**
- Behavior: popup lists the five kinds with a visibility toggle each (writes `Settings.kinds[kind].visible` via `saveSettings`), a "Open Recall" button (opens `baseUrl` in a tab), and a "Settings" button that calls `chrome.runtime.openOptionsPage()` (opens the full-page options in a new tab). Content scripts react via `chrome.storage.onChanged` to re-render markers immediately.

- [ ] **Step 1: Implement `popup.ts` + `popup.html`** — load settings, render five toggles, persist on change, an "Open Recall" button, and a "Settings" button calling `chrome.runtime.openOptionsPage()` (full-page options in a new tab).
- [ ] **Step 2: Build** — Run: `pnpm --dir extension build` — Expected: `dist/popup.html` present.
- [ ] **Step 3: Manual check** — toggling a kind hides/shows its markers on an open YouTube tab live.
- [ ] **Step 4: Commit**

```bash
git add extension/src/popup
git commit -m "feat(extension): popup — per-kind marker show/hide"
```

---

## PHASE D — Docs + full verification

### Task D1: Verify + document

- [ ] **Step 1: Recall checks** — Run: `npx tsc --noEmit` (exit 0), `npm run lint` (0 problems), `npx vitest run` (all pass).
- [ ] **Step 2: Extension checks** — Run: `pnpm --dir extension exec vitest run` (all pass), `pnpm --dir extension build` (exit 0).
- [ ] **Step 3: Update Recall ai-memory** — `docs/ai-memory/02-features-log.md` (capture feature), `03-decisions.md` (Gemini for drafting, R2 for frames, source-on-Card, extension-in-repo), `04-current-state.md` (new collections/env/routes), and `.env.local.example` already updated. Add an `extension/README.md` (build + load + configure).
- [ ] **Step 4: Commit**

```bash
git add docs/ai-memory extension/README.md
git commit -m "docs: record YouTube capture extension + capture backend"
```

---

## Self-Review

- **Spec coverage:** per-kind hotkeys (B2, C1–C4) ✓; screenshot → OCR → AI full-card draft (A3, A4) ✓; in-page overlay review/edit + undo + AI rephrase (C2, C3) ✓; all 5 kinds (A3 prompts, C2 editors) ✓; per-kind markers shape/color (C1) ✓; show/hide by kind (C1 filter, C5 popup) ✓; configurable shortcuts/markers/base URL (C4) ✓; save to Recall/Atlas (A1, A5, B4) ✓; R2 screenshots (A2) ✓; AI-suggested editable tags (A3 draft tags, C2 tags field) ✓; lazy image reveal in Test+Result+Cards (A7) ✓; export round-trip (A6) ✓.
- **Placeholder scan:** none — code shown for every code step; repetitive per-kind editors specified field-by-field in C2.
- **Type consistency:** `CardDraft`/`CaptureRequest`/`CaptureResponse` defined in A1, consumed in A3/A4/B4/C2; `CardSource` defined A1, consumed A4/A5/A7/C2; `Settings`/`KindConfig`/`matchShortcut` defined B2, consumed B4/C1/C3/C4/C5; marker shape enum shared (Recall `MarkerShape` A1 mirrors extension `MarkerShape` B2 — keep values identical).
- **Note for implementer:** the extension's `MarkerShape`/kind list must stay byte-identical to Recall's; a drift test isn't practical across the two build roots, so treat the Global Constraints marker table as the source of truth.
