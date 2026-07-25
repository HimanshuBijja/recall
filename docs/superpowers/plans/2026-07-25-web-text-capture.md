# Web Text Capture (Any Site) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Recall extension turn selected text on *any* website into N generated cards of a chosen kind, reviewed in a single batch overlay before saving.

**Architecture:** A second always-on content script (`web.js`, excluded from YouTube) handles non-video pages. A "Add question" context-menu item (registered by the service worker, `contexts: ["selection"]`) messages that script; the script reads the live DOM selection, shows a small config modal (count + kind), asks the service worker to `POST /api/generate`, then opens a batch overlay listing all N drafts for editing. MCQ/multi drafts render in a grid-styled option table; every other kind reuses the existing per-kind field renderers. The existing YouTube path (`content.js`, single-card `overlay.ts`) is untouched except for two shared modules it already owns (`fields.ts`, `ai.ts`) gaining scoping/layout parameters.

**Tech Stack:** TypeScript, Chrome MV3, Vite (three separate builds: ESM for background/pages, IIFE for `content.js`, IIFE for `web.js`), Vitest + jsdom (extension), Next.js 16 Route Handlers + Vitest node (Recall), `@google/genai`.

## Global Constraints

- **Recall commands:** `npx tsc --noEmit`, `npx vitest run`, `npm run lint`. Package manager is **npm**. Never run `npm run build` unless asked.
- **Extension commands:** `pnpm --dir extension exec tsc --noEmit`, `pnpm --dir extension test`, `pnpm --dir extension build`. Package manager is **pnpm**.
- **Never call live Gemini.** Every test mocks `@/lib/gemini`. Real Gemini/Vertex calls cost money and require explicit user permission (guardrail in `instructions.md`).
- **No `any`.** Use explicit types or `unknown`. This is enforced by `npm run lint`.
- **Import alias:** Recall internal imports use `@/*`. Extension uses relative paths (no alias configured).
- **Commit messages are on the user's name only** — no `Co-Authored-By: Claude` trailer.
- **Design palette (from `design.md`), used for all new extension UI:** background `#181818`, primary text `#EBDCC4`, secondary text/labels `#B6A596`, borders `#4A4441`, dividers `#2e2927`, accent `#DC9F85`, error `#fda4af`, success `#86efac`. Border radius max **4px** (the existing floating AI pills at 18px are pre-existing and stay). No gradients. Labels are uppercase, `font-weight:700`, `letter-spacing:0.05em`, 10–11px.
- **Non-goal (do not "fix" it):** `parseDraft` caps `distractors` at 3 and `tags` at 1 for every kind. That behaviour is load-bearing for the existing capture flow and its tests; leave it alone.
- **Non-goal:** web-captured cards do **not** auto-create groups (only `videoId` sources do) and do **not** appear in the analytics "By video" section.

## File Structure

**Recall (server) — new:**
- `lib/source.ts` — `isVideoSource` / `isWebSource` type guards. One responsibility: narrowing the `CardSource` union.
- `lib/source.test.ts`
- `app/api/generate/route.ts` — `POST /api/generate`, text → N drafts.
- `app/api/generate/route.test.ts`

**Recall (server) — modified:**
- `types/index.ts` — `CardSource` becomes a `VideoSource | WebSource` union.
- `app/api/cards/validate.ts` — `normalizeSource` accepts the web arm.
- `app/api/cards/validate.test.ts` — new cases.
- `app/api/cards/route.ts` — narrow with the guards before reading `videoId`/`timestamp`.
- `lib/gemini.ts` — extract `normalizeDraftObject`, add `parseDrafts` + `draftCardsFromText`.
- `lib/gemini.test.ts` — new cases.

**Extension — new:**
- `src/web/selection.ts` — pure DOM-selection reader + web-source builder. Testable without Chrome.
- `src/web/config-modal.ts` — the "how many / what kind" modal.
- `src/web/index.ts` — `web.js` content-script entry; orchestrates selection → modal → generate → batch overlay → save.
- `src/content/overlay/batch.ts` — the N-card review overlay.
- `vite.web.config.ts` — third build (IIFE, `web.js`).
- `tests/selection.test.ts`, `tests/config-modal.test.ts`, `tests/batch.test.ts`, `tests/generate-bg.test.ts`

**Extension — modified:**
- `src/shared/types.ts` — web source meta + generate request/response types.
- `src/background.ts` — context menu, `GENERATE_QUESTIONS`, `SAVE_CARDS`.
- `src/content/overlay/fields.ts` — `SourceMeta` becomes a union; `renderFields` gains an options-layout parameter.
- `src/content/overlay/ai.ts` — scope field lookups to the card element instead of the whole shadow root (required for N cards in one overlay).
- `manifest.json` — second content script + `contextMenus` permission.
- `package.json` — third build step.
- `tests/overlay.test.ts` — new cases.

---

### Task 1: `CardSource` becomes a video/web union

**Files:**
- Modify: `types/index.ts:18-25`
- Create: `lib/source.ts`
- Test: `lib/source.test.ts`
- Modify: `app/api/cards/validate.ts:6-19`
- Test: `app/api/cards/validate.test.ts` (append)
- Modify: `app/api/cards/route.ts:14-20`, `app/api/cards/route.ts:76-93`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `VideoSource`, `WebSource`, `CardSource` (union) in `types/index.ts`
  - `isVideoSource(s: CardSource | undefined): s is VideoSource` and `isWebSource(s: CardSource | undefined): s is WebSource` in `lib/source.ts`
  - `normalizeSource(raw: unknown): CardSource | undefined` — unchanged signature, now returns either arm.

**Why the web arm declares `videoId?: undefined`:** eight existing call sites do `card.source?.videoId === g.videoId` (`lib/analytics.ts:66`, `lib/exemptions.ts:43`, `app/groups/page.tsx:18`, `app/groups/[id]/GroupDetailClient.tsx:33`, `app/subjects/SubjectsClient.tsx:34`, `app/subjects/[id]/SubjectDetailClient.tsx:37`, `app/test/session/TestSession.tsx:70`, `app/cards/CardsBrowser.tsx:413`). Declaring the absent properties as `?: undefined` on the web arm keeps every one of those expressions type-checking unchanged, so this task touches only the two places that read `timestamp`/build groups.

- [ ] **Step 1: Write the failing test**

Create `lib/source.test.ts`:

```ts
import { expect, test } from "vitest";
import { isVideoSource, isWebSource } from "@/lib/source";
import type { CardSource } from "@/types";

const video: CardSource = { videoId: "abc", url: "https://youtu.be/abc", timestamp: 12 };
const web: CardSource = { type: "web", url: "https://mdn.io/x", capturedAt: "2026-07-25T00:00:00.000Z" };

test("isVideoSource accepts a legacy source with no type field", () => {
  expect(isVideoSource(video)).toBe(true);
  expect(isWebSource(video)).toBe(false);
});

test("isWebSource accepts the web arm", () => {
  expect(isWebSource(web)).toBe(true);
  expect(isVideoSource(web)).toBe(false);
});

test("both guards reject undefined", () => {
  expect(isVideoSource(undefined)).toBe(false);
  expect(isWebSource(undefined)).toBe(false);
});

test("isVideoSource rejects a video-shaped source with an empty videoId", () => {
  expect(isVideoSource({ videoId: "", url: "u", timestamp: 0 } as CardSource)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/source.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/source"`.

- [ ] **Step 3: Replace the `CardSource` interface with the union**

In `types/index.ts`, replace the whole `export interface CardSource { ... }` block (currently lines 18-25) with:

```ts
/** A card captured from a video frame (YouTube extension). */
export interface VideoSource {
  type?: "video";
  videoId: string;
  url: string;
  timestamp: number;
  channel?: string;
  title?: string;
  screenshotUrl?: string;
  marker?: { shape: MarkerShape; color: string };
}

/**
 * A card generated from selected text on an ordinary web page.
 * The video-only properties are declared as `?: undefined` so that existing
 * `card.source?.videoId` reads keep type-checking against the union.
 */
export interface WebSource {
  type: "web";
  url: string;
  title?: string;
  siteName?: string;
  /** First ~400 chars of the text the card was generated from. */
  excerpt?: string;
  capturedAt: string;
  videoId?: undefined;
  timestamp?: undefined;
  channel?: undefined;
  screenshotUrl?: undefined;
  marker?: undefined;
}

export type CardSource = VideoSource | WebSource;
```

- [ ] **Step 4: Write `lib/source.ts`**

```ts
import type { CardSource, VideoSource, WebSource } from "@/types";

export function isWebSource(s: CardSource | undefined): s is WebSource {
  return s?.type === "web";
}

export function isVideoSource(s: CardSource | undefined): s is VideoSource {
  return !!s && s.type !== "web" && typeof s.videoId === "string" && s.videoId.length > 0;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/source.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the failing test for the web arm of `normalizeSource`**

Append to `app/api/cards/validate.test.ts`:

```ts
test("normalizeSource accepts a web source", () => {
  const src = normalizeSource({
    type: "web",
    url: "https://developer.mozilla.org/en-US/docs/Web/CSS/grid",
    title: "CSS grid",
    siteName: "MDN",
    excerpt: "The grid CSS property is a shorthand...",
    capturedAt: "2026-07-25T10:00:00.000Z",
  });
  expect(src).toEqual({
    type: "web",
    url: "https://developer.mozilla.org/en-US/docs/Web/CSS/grid",
    title: "CSS grid",
    siteName: "MDN",
    excerpt: "The grid CSS property is a shorthand...",
    capturedAt: "2026-07-25T10:00:00.000Z",
  });
});

test("normalizeSource fills capturedAt when a web source omits it", () => {
  const src = normalizeSource({ type: "web", url: "https://example.com" });
  expect(src?.type).toBe("web");
  expect(typeof (src as { capturedAt?: string }).capturedAt).toBe("string");
});

test("normalizeSource drops a web source with no url", () => {
  expect(normalizeSource({ type: "web", title: "no url" })).toBeUndefined();
});

test("normalizeSource still drops a video source with no videoId", () => {
  expect(normalizeSource({ url: "u", timestamp: 3 })).toBeUndefined();
});
```

If `normalizeSource` is not already imported at the top of that file, add it to the existing import from `./validate`.

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run app/api/cards/validate.test.ts`
Expected: FAIL — the three web-source tests return `undefined` (the current guard requires `videoId`).

- [ ] **Step 8: Teach `normalizeSource` the web arm**

In `app/api/cards/validate.ts`, replace the body of `normalizeSource` (lines 6-19) with:

```ts
export function normalizeSource(raw: unknown): CardSource | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;

  if (o.type === "web") {
    if (typeof o.url !== "string" || !o.url) return undefined;
    const src: WebSource = {
      type: "web",
      url: o.url,
      capturedAt: typeof o.capturedAt === "string" && o.capturedAt ? o.capturedAt : new Date().toISOString(),
    };
    if (typeof o.title === "string") src.title = o.title;
    if (typeof o.siteName === "string") src.siteName = o.siteName;
    if (typeof o.excerpt === "string") src.excerpt = o.excerpt.slice(0, 400);
    return src;
  }

  if (typeof o.videoId !== "string" || !o.videoId) return undefined;
  if (typeof o.url !== "string" || typeof o.timestamp !== "number") return undefined;
  const src: VideoSource = { videoId: o.videoId, url: o.url, timestamp: o.timestamp };
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

Update the type import on line 1 of that file to:

```ts
import type { Card, CardKind, TfStatement, MatchPair, CardSource, VideoSource, WebSource, MarkerShape } from "@/types";
```

- [ ] **Step 9: Run it to verify it passes**

Run: `npx vitest run app/api/cards/validate.test.ts`
Expected: PASS, all tests including the four new ones.

- [ ] **Step 10: Narrow the two `videoId` readers in the cards route**

In `app/api/cards/route.ts`, add to the imports at the top:

```ts
import { isVideoSource } from "@/lib/source";
```

Replace the `if (videoId) { ... }` block in `GET` (lines 14-20) with:

```ts
  if (videoId) {
    return Response.json(
      cards.flatMap((c) => {
        const s = c.source;
        if (!isVideoSource(s) || s.videoId !== videoId) return [];
        return [{ id: c.id, kind: c.kind ?? "mcq", timestamp: s.timestamp, marker: s.marker }];
      }),
    );
  }
```

Replace the auto-group block in `POST` (lines 76-93) with:

```ts
  // Auto-group by video if this came from a video capture. Web-page captures
  // deliberately do not create groups.
  const videoSource = isVideoSource(card.source) ? card.source : null;
  if (videoSource) {
    const groups = await readDb<Group>("groups.json");
    const groupExists = groups.some((g) => g.videoId === videoSource.videoId);
    if (!groupExists) {
      const newGroup: Group = {
        id: crypto.randomUUID(),
        name: videoSource.title || "Video Group",
        tagIds: [],
        createdAt: new Date().toISOString(),
        videoId: videoSource.videoId,
        videoUrl: videoSource.url,
      };
      groups.push(newGroup);
      await writeDb("groups.json", groups);
    }
  }
```

- [ ] **Step 11: Typecheck the whole app**

Run: `npx tsc --noEmit`
Expected: no output (clean). If any file errors on a `source` property, narrow it with `isVideoSource(...)` from `@/lib/source` rather than casting.

- [ ] **Step 12: Run the full Recall suite and lint**

Run: `npx vitest run`
Expected: all tests pass (was 90 before; now 90 + 8 new).

Run: `npm run lint`
Expected: 0 errors (3 pre-existing warnings are fine).

- [ ] **Step 13: Commit**

```bash
git add types/index.ts lib/source.ts lib/source.test.ts app/api/cards/validate.ts app/api/cards/validate.test.ts app/api/cards/route.ts
git commit -m "feat(cards): add a web CardSource variant alongside the video one"
```

---

### Task 2: Generate N drafts from plain text (`lib/gemini.ts`)

**Files:**
- Modify: `lib/gemini.ts:66-94` (refactor `parseDraft`), append new exports at the end
- Test: `lib/gemini.test.ts` (append)

**Interfaces:**
- Consumes: `CardDraft` from `@/types/capture`, `CardKind` from `@/types` (both already exist).
- Produces:
  - `normalizeDraftObject(obj: Record<string, unknown>, kind: CardKind): CardDraft`
  - `parseDraft(raw: string, kind: CardKind): CardDraft` — signature unchanged, now delegates
  - `parseDrafts(raw: string, kind: CardKind, max: number): CardDraft[]`
  - `draftCardsFromText(text: string, kind: CardKind, count: number, pageTitle?: string): Promise<CardDraft[]>`

- [ ] **Step 1: Write the failing tests**

Append to `lib/gemini.test.ts`:

```ts
import { parseDrafts } from "@/lib/gemini";

test("parseDrafts reads a fenced JSON array of mcq drafts", () => {
  const raw = "```json\n" + JSON.stringify([
    { question: "Q1", answer: "A1", distractors: ["x", "y", "z"], tags: ["css"], explanation: "", hint: "" },
    { question: "Q2", answer: "A2", distractors: ["p", "q", "r"], tags: ["css"], explanation: "", hint: "" },
  ]) + "\n```";
  const drafts = parseDrafts(raw, "mcq", 10);
  expect(drafts).toHaveLength(2);
  expect(drafts[0].question).toBe("Q1");
  expect(drafts[1].answer).toBe("A2");
  expect(drafts.every((d) => d.kind === "mcq")).toBe(true);
});

test("parseDrafts unwraps a { cards: [...] } envelope", () => {
  const raw = JSON.stringify({ cards: [{ question: "Q", answer: "A", distractors: [], tags: [], explanation: "", hint: "" }] });
  expect(parseDrafts(raw, "mcq", 10)).toHaveLength(1);
});

test("parseDrafts accepts a bare single object", () => {
  const raw = JSON.stringify({ question: "Q", answer: "A", distractors: [], tags: [], explanation: "", hint: "" });
  expect(parseDrafts(raw, "mcq", 10)).toHaveLength(1);
});

test("parseDrafts drops content-free entries", () => {
  const raw = JSON.stringify([
    { question: "Q", answer: "A", distractors: [], tags: [], explanation: "", hint: "" },
    { question: "", answer: "", distractors: [], tags: [], explanation: "", hint: "" },
  ]);
  expect(parseDrafts(raw, "mcq", 10)).toHaveLength(1);
});

test("parseDrafts enforces the max cap", () => {
  const raw = JSON.stringify(
    Array.from({ length: 9 }, (_, i) => ({ question: `Q${i}`, answer: "A", distractors: [], tags: [], explanation: "", hint: "" })),
  );
  expect(parseDrafts(raw, "mcq", 3)).toHaveLength(3);
});

test("parseDrafts on garbage returns an empty array", () => {
  expect(parseDrafts("sorry I cannot", "flash", 5)).toEqual([]);
});

test("parseDrafts keeps tf-sort statements and drops under-filled ones", () => {
  const raw = JSON.stringify([
    { question: "Sort these", statements: [{ text: "a", isTrue: true }, { text: "b", isTrue: false }], tags: [], explanation: "", hint: "" },
    { question: "Too few", statements: [{ text: "only one", isTrue: true }], tags: [], explanation: "", hint: "" },
  ]);
  const drafts = parseDrafts(raw, "tf-sort", 10);
  expect(drafts).toHaveLength(1);
  expect(drafts[0].statements).toHaveLength(2);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run lib/gemini.test.ts`
Expected: FAIL — `parseDrafts is not a function` / import error.

- [ ] **Step 3: Refactor `parseDraft` into a reusable object normalizer**

In `lib/gemini.ts`, replace the whole `export function parseDraft(...)` body (lines 66-94) with:

```ts
export function normalizeDraftObject(obj: Record<string, unknown>, kind: CardKind): CardDraft {
  const base = emptyDraft(kind);
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  base.question = s(obj.question);
  base.answer = s(obj.answer);
  base.explanation = s(obj.explanation);
  base.hint = s(obj.hint);
  base.tags = arr(obj.tags).map((t) => s(t).toLowerCase().trim()).filter(Boolean).slice(0, 1);
  base.distractors = arr(obj.distractors).map(s).filter(Boolean).slice(0, 3);
  if (kind === "multi") base.answers = arr(obj.answers).map(s).filter(Boolean);
  if (kind === "cloze") base.clozeText = s(obj.clozeText);
  if (kind === "tf-sort") base.statements = arr(obj.statements)
    .map((x) => ({ text: s((x as Record<string, unknown>)?.text), isTrue: Boolean((x as Record<string, unknown>)?.isTrue) }))
    .filter((x) => x.text);
  if (kind === "match") base.pairs = arr(obj.pairs)
    .map((x) => ({ left: s((x as Record<string, unknown>)?.left), right: s((x as Record<string, unknown>)?.right) }))
    .filter((x) => x.left && x.right);
  return base;
}

function extractJson(raw: string): unknown {
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const jsonText = (fence ? fence[1] : raw).trim();
  try {
    return JSON.parse(jsonText);
  } catch {
    const block = /(\[[\s\S]*\]|\{[\s\S]*\})/.exec(jsonText);
    if (!block) return null;
    try {
      return JSON.parse(block[1]);
    } catch {
      return null;
    }
  }
}

export function parseDraft(raw: string, kind: CardKind): CardDraft {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyDraft(kind);
  return normalizeDraftObject(parsed as Record<string, unknown>, kind);
}

/** A draft with nothing usable in it — the model returned a stub or a refusal. */
function hasContent(d: CardDraft): boolean {
  if (d.kind === "cloze") return Boolean(d.clozeText?.trim());
  if (d.kind === "tf-sort") return (d.statements ?? []).length >= 2;
  if (d.kind === "match") return (d.pairs ?? []).length >= 2;
  if (d.kind === "multi") return Boolean(d.question.trim()) && (d.answers ?? []).length >= 1;
  return Boolean(d.question.trim() && d.answer.trim());
}

export function parseDrafts(raw: string, kind: CardKind, max: number): CardDraft[] {
  const parsed = extractJson(raw);
  if (!parsed) return [];
  let list: unknown[];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (typeof parsed === "object" && Array.isArray((parsed as { cards?: unknown }).cards)) {
    list = (parsed as { cards: unknown[] }).cards;
  } else if (typeof parsed === "object") {
    list = [parsed];
  } else {
    return [];
  }
  return list
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map((x) => normalizeDraftObject(x, kind))
    .filter(hasContent)
    .slice(0, max);
}
```

- [ ] **Step 4: Run the gemini tests to verify they pass**

Run: `npx vitest run lib/gemini.test.ts`
Expected: PASS — the 3 pre-existing `parseDraft` tests plus the 7 new `parseDrafts` tests.

- [ ] **Step 5: Add `draftCardsFromText`**

Append to the end of `lib/gemini.ts`:

```ts
/** Hard ceiling on prompt size so one giant selection can't run up a bill. */
const MAX_SOURCE_CHARS = 20000;

export async function draftCardsFromText(
  text: string,
  kind: CardKind,
  count: number,
  pageTitle?: string,
): Promise<CardDraft[]> {
  const source = text.slice(0, MAX_SOURCE_CHARS);
  const prompt = `You are turning a passage of text from a web page into EXACTLY ${count} revision card(s).
${pageTitle ? `The page title is: "${pageTitle}".` : ""}

SOURCE TEXT:
"""
${source}
"""

RULES:
- Produce exactly ${count} cards, each testing a DIFFERENT fact or idea from the source text. Do not repeat a fact across cards.
- Base every card strictly on the source text. Do not invent facts that are not in it.
- If the source text does not contain enough distinct material for ${count} cards, return as many good cards as it supports rather than padding with filler.
- The "tags" list of every card MUST contain exactly ONE lowercase string naming the main topic of the source text (1-3 words, e.g. "css grid", "cellular respiration").

${KIND_INSTRUCTIONS[kind]}

Return ONLY a JSON array of ${count} card objects with the keys described above. No prose, no markdown fences.`;

  const res = await client().models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return parseDrafts(res.text ?? "", kind, count);
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: all pass. `app/api/capture/route.test.ts` and `app/api/edit/route.test.ts` still pass — `parseDraft` kept its signature.

- [ ] **Step 8: Commit**

```bash
git add lib/gemini.ts lib/gemini.test.ts
git commit -m "feat(gemini): generate N card drafts from a text passage"
```

---

### Task 3: `POST /api/generate`

**Files:**
- Create: `app/api/generate/route.ts`
- Test: `app/api/generate/route.test.ts`

**Interfaces:**
- Consumes: `draftCardsFromText` from Task 2.
- Produces: `POST /api/generate` with body `{ text: string; kind: CardKind; count: number; pageTitle?: string; pageUrl?: string }` → `200 { ok: true, drafts: CardDraft[] }` | `400 { ok: false, error }` | `500 { ok: false, error }`. `count` is clamped to 1..20. The extension's background worker calls this.

- [ ] **Step 1: Write the failing test**

Create `app/api/generate/route.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/gemini", () => ({
  draftCardsFromText: vi.fn(async () => [
    { kind: "mcq", question: "Q1", answer: "A1", distractors: ["b", "c", "d"], tags: ["css"], explanation: "", hint: "" },
    { kind: "mcq", question: "Q2", answer: "A2", distractors: ["b", "c", "d"], tags: ["css"], explanation: "", hint: "" },
  ]),
}));

import { POST } from "@/app/api/generate/route";

function req(body: unknown) {
  return new Request("http://localhost/api/generate", { method: "POST", body: JSON.stringify(body) }) as never;
}

beforeEach(() => vi.clearAllMocks());

test("returns drafts for a valid request", async () => {
  const res = await POST(req({ text: "Grid is a two-dimensional layout system.", kind: "mcq", count: 2, pageTitle: "CSS grid" }));
  const json = await res.json();
  expect(res.status).toBe(200);
  expect(json.ok).toBe(true);
  expect(json.drafts).toHaveLength(2);
  expect(json.drafts[0].question).toBe("Q1");
});

test("400 when text is missing or blank", async () => {
  expect((await POST(req({ kind: "mcq", count: 2 }))).status).toBe(400);
  expect((await POST(req({ text: "   ", kind: "mcq", count: 2 }))).status).toBe(400);
});

test("400 on an unknown kind", async () => {
  const res = await POST(req({ text: "some text", kind: "essay", count: 2 }));
  expect(res.status).toBe(400);
});

test("clamps count to the 1..20 range", async () => {
  const { draftCardsFromText } = await import("@/lib/gemini");
  await POST(req({ text: "some text", kind: "mcq", count: 99 }));
  expect(draftCardsFromText).toHaveBeenCalledWith("some text", "mcq", 20, undefined);
  vi.clearAllMocks();
  await POST(req({ text: "some text", kind: "mcq", count: 0 }));
  expect(draftCardsFromText).toHaveBeenCalledWith("some text", "mcq", 1, undefined);
});

test("500 with the message when generation throws", async () => {
  const { draftCardsFromText } = await import("@/lib/gemini");
  (draftCardsFromText as unknown as { mockRejectedValueOnce: (e: Error) => void }).mockRejectedValueOnce(new Error("quota exceeded"));
  const res = await POST(req({ text: "some text", kind: "mcq", count: 2 }));
  const json = await res.json();
  expect(res.status).toBe(500);
  expect(json.error).toBe("quota exceeded");
});

test("200 with an empty list when the model produced nothing usable", async () => {
  const { draftCardsFromText } = await import("@/lib/gemini");
  (draftCardsFromText as unknown as { mockResolvedValueOnce: (v: unknown[]) => void }).mockResolvedValueOnce([]);
  const res = await POST(req({ text: "some text", kind: "mcq", count: 2 }));
  const json = await res.json();
  expect(res.status).toBe(200);
  expect(json.ok).toBe(true);
  expect(json.drafts).toEqual([]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run app/api/generate/route.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/api/generate/route"`.

- [ ] **Step 3: Write the route**

Create `app/api/generate/route.ts`:

```ts
import { NextRequest } from "next/server";
import type { CardKind } from "@/types";
import { draftCardsFromText } from "@/lib/gemini";

export const dynamic = "force-dynamic";

const KINDS: CardKind[] = ["mcq", "multi", "flash", "cloze", "tf-sort", "match"];
const MAX_COUNT = 20;

export async function POST(req: NextRequest): Promise<Response> {
  const body = (await req.json()) as {
    text?: unknown;
    kind?: unknown;
    count?: unknown;
    pageTitle?: unknown;
  };

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return Response.json({ ok: false, error: "text is required" }, { status: 400 });
  }
  if (!KINDS.includes(body.kind as CardKind)) {
    return Response.json({ ok: false, error: `unknown card kind: ${String(body.kind)}` }, { status: 400 });
  }
  const kind = body.kind as CardKind;

  const requested = Math.floor(Number(body.count));
  const count = Number.isFinite(requested) ? Math.min(MAX_COUNT, Math.max(1, requested)) : 1;
  const pageTitle = typeof body.pageTitle === "string" ? body.pageTitle : undefined;

  try {
    const drafts = await draftCardsFromText(text, kind, count, pageTitle);
    return Response.json({ ok: true, drafts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "generation failed";
    console.error("[generate] 500:", msg, e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/api/generate/route.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck, lint, full suite**

Run: `npx tsc --noEmit` → clean
Run: `npm run lint` → 0 errors
Run: `npx vitest run` → all pass

- [ ] **Step 6: Commit**

```bash
git add app/api/generate/route.ts app/api/generate/route.test.ts
git commit -m "feat(api): add POST /api/generate for text-to-cards generation"
```

---

### Task 4: Extension shared types + selection reader

**Files:**
- Modify: `extension/src/shared/types.ts` (append)
- Create: `extension/src/web/selection.ts`
- Test: `extension/tests/selection.test.ts`

**Interfaces:**
- Consumes: `CaptureKind`, `CardDraft` from `../shared/types`.
- Produces:
  - `WebSourceMeta` — `{ type: "web"; url: string; title?: string; siteName?: string; excerpt?: string; capturedAt: string }` (matches the server's `WebSource` from Task 1)
  - `GenerateRequest` — `{ text: string; kind: CaptureKind; count: number; pageTitle?: string; pageUrl?: string }`
  - `GenerateResponse` — `{ ok: boolean; drafts?: CardDraft[]; error?: string }`
  - `SaveCardsResult` — `{ saved: number; queued: number; failed: number }`
  - `readSelection(win: Window, doc: Document): SelectionSnapshot | null` where `SelectionSnapshot = { text: string; url: string; title: string; siteName?: string }`
  - `buildWebSource(snap: SelectionSnapshot, now?: () => string): WebSourceMeta`

- [ ] **Step 1: Write the failing test**

Create `extension/tests/selection.test.ts`:

```ts
import { expect, test } from "vitest";
import { readSelection, buildWebSource } from "../src/web/selection";

function fakeWindow(selectionText: string, href = "https://example.com/page"): Window {
  return {
    getSelection: () => ({ toString: () => selectionText }),
    location: { href },
  } as unknown as Window;
}

function fakeDoc(title: string, siteName?: string): Document {
  const doc = document.implementation.createHTMLDocument(title);
  if (siteName) {
    const meta = doc.createElement("meta");
    meta.setAttribute("property", "og:site_name");
    meta.setAttribute("content", siteName);
    doc.head.append(meta);
  }
  return doc;
}

test("readSelection returns the trimmed selection with page metadata", () => {
  const snap = readSelection(fakeWindow("  hello world  "), fakeDoc("My Page", "MDN"));
  expect(snap).toEqual({
    text: "hello world",
    url: "https://example.com/page",
    title: "My Page",
    siteName: "MDN",
  });
});

test("readSelection falls back to the hostname when og:site_name is absent", () => {
  const snap = readSelection(fakeWindow("text", "https://developer.mozilla.org/docs"), fakeDoc("Docs"));
  expect(snap?.siteName).toBe("developer.mozilla.org");
});

test("readSelection returns null for an empty or whitespace-only selection", () => {
  expect(readSelection(fakeWindow(""), fakeDoc("t"))).toBeNull();
  expect(readSelection(fakeWindow("   \n  "), fakeDoc("t"))).toBeNull();
});

test("buildWebSource produces a web-typed source with a truncated excerpt", () => {
  const long = "x".repeat(900);
  const src = buildWebSource(
    { text: long, url: "https://example.com/p", title: "T", siteName: "S" },
    () => "2026-07-25T00:00:00.000Z",
  );
  expect(src.type).toBe("web");
  expect(src.url).toBe("https://example.com/p");
  expect(src.title).toBe("T");
  expect(src.siteName).toBe("S");
  expect(src.capturedAt).toBe("2026-07-25T00:00:00.000Z");
  expect(src.excerpt).toHaveLength(400);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --dir extension test selection`
Expected: FAIL — cannot resolve `../src/web/selection`.

- [ ] **Step 3: Append the new shared types**

Append to `extension/src/shared/types.ts`:

```ts
export interface WebSourceMeta {
  type: "web";
  url: string;
  title?: string;
  siteName?: string;
  excerpt?: string;
  capturedAt: string;
}

export interface GenerateRequest {
  text: string;
  kind: CaptureKind;
  count: number;
  pageTitle?: string;
  pageUrl?: string;
}

export interface GenerateResponse {
  ok: boolean;
  drafts?: CardDraft[];
  error?: string;
}

export interface SaveCardsResult {
  saved: number;
  queued: number;
  failed: number;
}
```

- [ ] **Step 4: Write `src/web/selection.ts`**

```ts
import type { WebSourceMeta } from "../shared/types";

export interface SelectionSnapshot {
  text: string;
  url: string;
  title: string;
  siteName?: string;
}

const EXCERPT_CHARS = 400;

/**
 * Reads the live DOM selection rather than trusting the context-menu event's
 * `info.selectionText`, which Chrome truncates at roughly 1024 characters.
 */
export function readSelection(win: Window, doc: Document): SelectionSnapshot | null {
  const text = (win.getSelection()?.toString() ?? "").trim();
  if (!text) return null;

  const metaSite = doc.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content?.trim();
  let siteName = metaSite || undefined;
  if (!siteName) {
    try {
      siteName = new URL(win.location.href).hostname;
    } catch {
      siteName = undefined;
    }
  }

  return { text, url: win.location.href, title: doc.title, siteName };
}

export function buildWebSource(
  snap: SelectionSnapshot,
  now: () => string = () => new Date().toISOString(),
): WebSourceMeta {
  return {
    type: "web",
    url: snap.url,
    title: snap.title || undefined,
    siteName: snap.siteName,
    excerpt: snap.text.slice(0, EXCERPT_CHARS),
    capturedAt: now(),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --dir extension test selection`
Expected: PASS, 4 tests.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm --dir extension exec tsc --noEmit`
Expected: clean.

```bash
git add extension/src/shared/types.ts extension/src/web/selection.ts extension/tests/selection.test.ts
git commit -m "feat(extension): add web source types and a DOM selection reader"
```

---

### Task 5: Background — context menu, generation, batch save

**Files:**
- Modify: `extension/src/background.ts`
- Modify: `extension/manifest.json:14` (permissions)
- Test: `extension/tests/generate-bg.test.ts`

**Interfaces:**
- Consumes: `GenerateRequest`, `GenerateResponse`, `SaveCardsResult` from Task 4.
- Produces:
  - `buildGenerateUrl(baseUrl: string): string` → `` `${baseUrl}/api/generate` ``
  - `BgMessage` gains `{ type: "GENERATE_QUESTIONS"; req: GenerateRequest }` and `{ type: "SAVE_CARDS"; cards: unknown[] }`
  - `handleMessage({ type: "GENERATE_QUESTIONS", req })` → `GenerateResponse`
  - `handleMessage({ type: "SAVE_CARDS", cards })` → `SaveCardsResult`
  - The content script receives `{ type: "OPEN_QUESTION_MODAL" }` when the menu item is clicked (Task 9 consumes it).

- [ ] **Step 1: Write the failing test**

Create `extension/tests/generate-bg.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";
import { buildGenerateUrl, handleMessage } from "../src/background";

beforeEach(() => {
  vi.restoreAllMocks();
  (globalThis as unknown as { chrome: Record<string, unknown> }).chrome = {
    storage: {
      sync: { get: async () => ({ settings: { baseUrl: "http://localhost:3000" } }), set: async () => {} },
      local: { get: async () => ({ queue: [] }), set: async () => {} },
    },
    alarms: { create: () => {}, clear: async () => {}, onAlarm: { addListener: () => {} } },
    runtime: { onMessage: { addListener: () => {} } },
    contextMenus: { create: () => {}, onClicked: { addListener: () => {} }, removeAll: (cb: () => void) => cb() },
    tabs: { sendMessage: async () => ({}) },
    scripting: { executeScript: async () => [] },
  } as never;
});

test("buildGenerateUrl appends the generate path", () => {
  expect(buildGenerateUrl("http://localhost:3000")).toBe("http://localhost:3000/api/generate");
});

test("GENERATE_QUESTIONS posts to /api/generate and returns the drafts", async () => {
  const fetchMock = vi.fn(async () => new Response(
    JSON.stringify({ ok: true, drafts: [{ kind: "mcq", question: "Q", answer: "A", distractors: [], tags: [], explanation: "", hint: "" }] }),
    { status: 200 },
  ));
  vi.stubGlobal("fetch", fetchMock);

  const res = await handleMessage({
    type: "GENERATE_QUESTIONS",
    req: { text: "some text", kind: "mcq", count: 1, pageTitle: "T", pageUrl: "https://x.com" },
  }) as { ok: boolean; drafts: unknown[] };

  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3000/api/generate");
  expect(res.ok).toBe(true);
  expect(res.drafts).toHaveLength(1);
});

test("GENERATE_QUESTIONS surfaces the server error message on a non-2xx", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "quota exceeded" }), { status: 500 })));
  const res = await handleMessage({
    type: "GENERATE_QUESTIONS",
    req: { text: "t", kind: "mcq", count: 1 },
  }) as { ok: boolean; error: string };
  expect(res.ok).toBe(false);
  expect(res.error).toBe("quota exceeded");
});

test("SAVE_CARDS reports how many saved and how many queued", async () => {
  let call = 0;
  vi.stubGlobal("fetch", vi.fn(async () => {
    call += 1;
    return call === 2 ? new Response("nope", { status: 500 }) : new Response(JSON.stringify({ id: "x" }), { status: 201 });
  }));
  const res = await handleMessage({ type: "SAVE_CARDS", cards: [{ a: 1 }, { b: 2 }, { c: 3 }] }) as {
    saved: number; queued: number; failed: number;
  };
  expect(res.saved).toBe(2);
  expect(res.queued).toBe(1);
  expect(res.failed).toBe(0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --dir extension test generate-bg`
Expected: FAIL — `buildGenerateUrl` is not exported.

- [ ] **Step 3: Extend `src/background.ts`**

Add to the imports at the top of `extension/src/background.ts`:

```ts
import type { CaptureRequest, CaptureResponse, GenerateRequest, GenerateResponse, SaveCardsResult } from "./shared/types";
```

(replacing the existing `import type { CaptureRequest, CaptureResponse } from "./shared/types";`)

Add next to `buildCardsUrl`:

```ts
export function buildGenerateUrl(baseUrl: string): string {
  return `${baseUrl}/api/generate`;
}
```

Extend the `BgMessage` union with two members:

```ts
  | { type: "GENERATE_QUESTIONS"; req: GenerateRequest }
  | { type: "SAVE_CARDS"; cards: unknown[] }
```

Extend the `BgResponse` union with:

```ts
  | GenerateResponse
  | SaveCardsResult
```

Add these two branches inside `handleMessage`, immediately before the final `return { ok: false, error: "unknown message" };`:

```ts
  if (msg.type === "GENERATE_QUESTIONS") {
    const controller = new AbortController();
    // Generating N cards takes materially longer than a single capture.
    const id = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(buildGenerateUrl(base), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg.req),
        signal: controller.signal,
      });
      clearTimeout(id);
      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: errJson.error || `generation failed (${res.status})` };
      }
      return (await res.json()) as GenerateResponse;
    } catch (e) {
      clearTimeout(id);
      const isAbort = e instanceof Error && e.name === "AbortError";
      return {
        ok: false,
        error: isAbort ? "AI request timed out (60s)" : e instanceof Error ? e.message : "generation failed",
      };
    }
  }

  if (msg.type === "SAVE_CARDS") {
    let saved = 0;
    let queued = 0;
    for (const card of msg.cards) {
      const result = await postCard(base, card);
      if (result.ok) {
        saved += 1;
      } else {
        await enqueue(card);
        queued += 1;
      }
    }
    return { saved, queued, failed: 0 };
  }
```

Append the context-menu wiring at the very end of the file, after the existing `chrome.alarms.onAlarm` listener:

```ts
const MENU_ID = "recall-add-question";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Add question",
      contexts: ["selection"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  const tabId = tab.id;
  // The always-on content script is not present in tabs that were already
  // open when the extension installed or reloaded — inject it, then retry.
  void chrome.tabs.sendMessage(tabId, { type: "OPEN_QUESTION_MODAL" }).catch(async () => {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["web.js"] });
    await chrome.tabs.sendMessage(tabId, { type: "OPEN_QUESTION_MODAL" });
  });
});
```

- [ ] **Step 4: Add the `contextMenus` permission**

In `extension/manifest.json`, replace line 14 with:

```json
  "permissions": ["storage", "alarms", "tabs", "scripting", "contextMenus"]
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --dir extension test generate-bg`
Expected: PASS, 4 tests.

- [ ] **Step 6: Run the whole extension suite and typecheck**

Run: `pnpm --dir extension test`
Expected: all pass (24 pre-existing + 4 new + 4 from Task 4 = 32).

Run: `pnpm --dir extension exec tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add extension/src/background.ts extension/manifest.json extension/tests/generate-bg.test.ts
git commit -m "feat(extension): add the Add question context menu, generation and batch save"
```

---

### Task 6: Table option layout + web sources in `fields.ts`, scoped `ai.ts`

**Files:**
- Modify: `extension/src/content/overlay/fields.ts:3-9` (SourceMeta), `:11-36` (draftToCard), `:80-86` (renderFields signature), `:133-189` (options rendering)
- Modify: `extension/src/content/overlay/ai.ts` (all `shadow.querySelector*` field lookups)
- Modify: `extension/src/content/overlay/styles.ts` (append table styles)
- Test: `extension/tests/overlay.test.ts` (append)

**Interfaces:**
- Consumes: `WebSourceMeta` from Task 4.
- Produces:
  - `VideoSourceMeta` (the old `SourceMeta` shape) and `SourceMeta = VideoSourceMeta | WebSourceMeta`
  - `renderFields(kind, draft, kindRoot, metaRoot, allTags?, optionsLayout?: "rows" | "table"): FieldsRoot` — the 6th parameter defaults to `"rows"`, so the YouTube overlay is unchanged.
  - `draftToCard(draft, source: SourceMeta, screenshotUrl?, marker?)` — attaches `screenshotUrl`/`marker` only to video sources.

**Why a CSS grid and not a `<table>`:** `ai.ts` inserts its diff block as a *sibling* of the element it replaces. Inside a real `<tbody>` that would be a stray `<div>` between `<tr>`s, which renders unpredictably. A grid-styled row keeps the table's visual structure while letting the existing `addPill` insertion logic work untouched.

- [ ] **Step 1: Write the failing test**

Append to `extension/tests/overlay.test.ts`:

```ts
import { buildWebSource } from "../src/web/selection";

test("draftToCard attaches a web source verbatim and skips screenshot/marker", () => {
  const src = buildWebSource(
    { text: "passage", url: "https://mdn.io/p", title: "T", siteName: "MDN" },
    () => "2026-07-25T00:00:00.000Z",
  );
  const body = draftToCard(
    { kind: "flash", question: "Q", answer: "A", distractors: [], tags: [], explanation: "", hint: "" },
    src,
  );
  expect(body.source).toEqual({
    type: "web",
    url: "https://mdn.io/p",
    title: "T",
    siteName: "MDN",
    excerpt: "passage",
    capturedAt: "2026-07-25T00:00:00.000Z",
  });
});

test("renderFields table layout renders an index cell per mcq option", () => {
  const kindRoot = document.createElement("div");
  const metaRoot = document.createElement("div");
  renderFields(
    "mcq",
    { kind: "mcq", question: "Q", answer: "A", distractors: ["b", "c"], tags: [], explanation: "", hint: "" },
    kindRoot,
    metaRoot,
    [],
    "table",
  );
  const rows = kindRoot.querySelectorAll(".option-row");
  expect(rows).toHaveLength(3);
  expect(kindRoot.querySelector(".options-table-head")).not.toBeNull();
  expect(rows[0].querySelector(".option-index")?.textContent).toBe("1");
  expect(rows[2].querySelector(".option-index")?.textContent).toBe("3");
});

test("renderFields table layout still reads back correct answers and distractors", () => {
  const kindRoot = document.createElement("div");
  const metaRoot = document.createElement("div");
  const fields = renderFields(
    "multi",
    { kind: "multi", question: "Q", answer: "", answers: ["A", "B"], distractors: ["c"], tags: [], explanation: "", hint: "" },
    kindRoot,
    metaRoot,
    [],
    "table",
  );
  const values = fields.readValues();
  expect(values.answers).toEqual(["A", "B"]);
  expect(values.distractors).toEqual(["c"]);
});

test("renderFields defaults to the row layout with no index cells", () => {
  const kindRoot = document.createElement("div");
  const metaRoot = document.createElement("div");
  renderFields(
    "mcq",
    { kind: "mcq", question: "Q", answer: "A", distractors: ["b"], tags: [], explanation: "", hint: "" },
    kindRoot,
    metaRoot,
    [],
  );
  expect(kindRoot.querySelector(".options-table-head")).toBeNull();
  expect(kindRoot.querySelector(".option-index")).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --dir extension test overlay`
Expected: FAIL — `renderFields` ignores the 6th argument, so `.options-table-head` is null.

- [ ] **Step 3: Make `SourceMeta` a union and update `draftToCard`**

In `extension/src/content/overlay/fields.ts`, replace lines 1-36 with:

```ts
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
  return body;
}
```

- [ ] **Step 4: Add the layout parameter to `renderFields`**

In the same file, change the `renderFields` signature (currently lines 80-86) to:

```ts
export type OptionsLayout = "rows" | "table";

export function renderFields(
  kind: CaptureKind,
  draft: CardDraft,
  kindRoot: HTMLElement,
  metaRoot: HTMLElement,
  allTags: { id: string; name: string }[] = [],
  optionsLayout: OptionsLayout = "rows",
): FieldsRoot {
```

Replace the `optionsContainer` declaration (currently line 133) with:

```ts
  const optionsContainer = el("div", {
    class: optionsLayout === "table" ? "options-table" : "",
    style: "display:flex;flex-direction:column;gap:8px;margin-bottom:8px;",
  });
```

Replace the body of `renderOptions` (currently lines 146-179) with:

```ts
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
```

- [ ] **Step 5: Append the table styles**

Append inside the template literal at the end of `extension/src/content/overlay/styles.ts` (before the closing backtick):

```
  .options-table-head {
    display: grid;
    grid-template-columns: 28px 1fr 72px 32px;
    align-items: center;
    gap: 8px;
    padding: 0 4px 6px;
    border-bottom: 1px solid #4A4441;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #B6A596;
  }
  .option-row-table {
    display: grid;
    grid-template-columns: 28px 1fr 72px 32px;
    align-items: start;
    gap: 8px;
    padding: 6px 4px;
    border-bottom: 1px solid #2e2927;
  }
  .option-row-table .option-index {
    font-size: 11px;
    color: #B6A596;
    padding-top: 8px;
  }
  .option-row-table .toggle-correct-btn {
    justify-self: center;
    margin-top: 4px;
  }
```

- [ ] **Step 6: Scope `ai.ts` field lookups to the card element**

`initAIEditor` currently looks fields up with `shadow.querySelector(...)`. With N cards in one shadow root that would always find card #1's fields. Its `card` parameter is already the element containing the fields, so switch every field lookup to it.

In `extension/src/content/overlay/ai.ts`, replace these occurrences (keep `shadow.getSelection()` and `shadow.activeElement` in `handleSelection` as they are — those are genuinely shadow-root-level APIs):

- Line 340: `const elements = Array.from(shadow.querySelectorAll("textarea, input"));` → `const elements = Array.from(card.querySelectorAll("textarea, input"));`
- Line 346: `const rows = Array.from(shadow.querySelectorAll(".option-row"));` → `const rows = Array.from(card.querySelectorAll(".option-row"));`
- Line 427: `shadow.querySelector('[data-field="question"]')` → `card.querySelector('[data-field="question"]')`
- Line 443: `shadow.querySelector('[data-field="explanation"]')` → `card.querySelector('[data-field="explanation"]')`
- Line 459: `shadow.querySelector('[data-field="hint"]')` → `card.querySelector('[data-field="hint"]')`
- Line 471: `shadow.querySelector('[data-field="answer"]')` → `card.querySelector('[data-field="answer"]')`
- Line 487: `shadow.querySelector('[data-field="tags"]')` → `card.querySelector('[data-field="tags"]')`
- Line 511: `` shadow.querySelector(`[data-field="option"][data-index="${idx}"]`) `` → `` card.querySelector(`[data-field="option"][data-index="${idx}"]`) ``
- Line 558: `` shadow.querySelector(`[data-field="statement"][data-index="${idx}"]`) `` → `` card.querySelector(...) ``
- Line 584: `` shadow.querySelector(`[data-field="pair-left"][data-index="${idx}"]`) `` → `` card.querySelector(...) ``
- Line 600: `` shadow.querySelector(`[data-field="pair-right"][data-index="${idx}"]`) `` → `` card.querySelector(...) ``

Then add an `optionsLayout` field to `AIEditorContext` so the batch overlay's re-renders keep the table layout, and thread it through the three `renderFields` calls in that file (lines 355, 625, 633):

```ts
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
  optionsLayout?: OptionsLayout;
  getFields: () => FieldsRoot;
  setFields: (fields: FieldsRoot) => void;
}
```

Update the import on line 2 to `import { renderFields, type FieldsRoot, type OptionsLayout, type SourceMeta } from "./fields";`, destructure `optionsLayout = "rows"` alongside the other fields in the `const { ... } = ctx;` block, and change all three `renderFields(opts.kind, X, kindFieldsRoot, metaFieldsRoot, allTags)` calls to `renderFields(opts.kind, X, kindFieldsRoot, metaFieldsRoot, allTags, optionsLayout)`.

- [ ] **Step 7: Run the overlay tests to verify they pass**

Run: `pnpm --dir extension test overlay`
Expected: PASS — all pre-existing tests plus the 4 new ones.

- [ ] **Step 8: Typecheck and run the full extension suite**

Run: `pnpm --dir extension exec tsc --noEmit`
Expected: clean.

Run: `pnpm --dir extension test`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add extension/src/content/overlay/fields.ts extension/src/content/overlay/ai.ts extension/src/content/overlay/styles.ts extension/tests/overlay.test.ts
git commit -m "feat(extension): add a table option layout and per-card AI scoping"
```

---

### Task 7: The "how many / what kind" config modal

**Files:**
- Create: `extension/src/web/config-modal.ts`
- Test: `extension/tests/config-modal.test.ts`

**Interfaces:**
- Consumes: `CaptureKind`, `CAPTURE_KINDS` from `../shared/config`.
- Produces:
  - `QuestionConfig` — `{ count: number; kind: CaptureKind }`
  - `openConfigModal(selectionPreview: string, initial?: QuestionConfig): Promise<QuestionConfig | null>` — resolves `null` on cancel/Escape. Mounts a shadow-DOM host with id `recall-question-config-host`.
  - `KIND_LABELS: Record<CaptureKind, string>`

- [ ] **Step 1: Write the failing test**

Create `extension/tests/config-modal.test.ts`:

```ts
import { expect, test, beforeEach } from "vitest";
import { openConfigModal, KIND_LABELS } from "../src/web/config-modal";

beforeEach(() => {
  document.body.innerHTML = "";
});

function shadow(): ShadowRoot {
  const host = document.getElementById("recall-question-config-host");
  if (!host?.shadowRoot) throw new Error("modal host not mounted");
  return host.shadowRoot;
}

test("KIND_LABELS covers every capture kind", () => {
  expect(Object.keys(KIND_LABELS).sort()).toEqual(["cloze", "flash", "match", "mcq", "multi", "tf-sort"]);
});

test("resolves with the chosen count and kind on Generate", async () => {
  const pending = openConfigModal("Some selected passage of text");
  const countInput = shadow().querySelector<HTMLInputElement>("#recall-count")!;
  const kindSelect = shadow().querySelector<HTMLSelectElement>("#recall-kind")!;
  countInput.value = "7";
  kindSelect.value = "flash";
  shadow().querySelector<HTMLButtonElement>(".generate")!.click();

  await expect(pending).resolves.toEqual({ count: 7, kind: "flash" });
  expect(document.getElementById("recall-question-config-host")).toBeNull();
});

test("resolves null on Cancel", async () => {
  const pending = openConfigModal("text");
  shadow().querySelector<HTMLButtonElement>(".cancel")!.click();
  await expect(pending).resolves.toBeNull();
});

test("clamps an out-of-range count into 1..20", async () => {
  const pending = openConfigModal("text");
  shadow().querySelector<HTMLInputElement>("#recall-count")!.value = "500";
  shadow().querySelector<HTMLButtonElement>(".generate")!.click();
  await expect(pending).resolves.toEqual({ count: 20, kind: "mcq" });
});

test("seeds the form from the initial config", async () => {
  const pending = openConfigModal("text", { count: 3, kind: "cloze" });
  expect(shadow().querySelector<HTMLInputElement>("#recall-count")!.value).toBe("3");
  expect(shadow().querySelector<HTMLSelectElement>("#recall-kind")!.value).toBe("cloze");
  shadow().querySelector<HTMLButtonElement>(".cancel")!.click();
  await pending;
});

test("shows a truncated preview of the selection", () => {
  const pending = openConfigModal("y".repeat(500));
  const preview = shadow().querySelector(".selection-preview")!.textContent ?? "";
  expect(preview.length).toBeLessThanOrEqual(163);
  expect(preview.endsWith("…")).toBe(true);
  shadow().querySelector<HTMLButtonElement>(".cancel")!.click();
  return pending;
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --dir extension test config-modal`
Expected: FAIL — cannot resolve `../src/web/config-modal`.

- [ ] **Step 3: Write `src/web/config-modal.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --dir extension test config-modal`
Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --dir extension exec tsc --noEmit` → clean

```bash
git add extension/src/web/config-modal.ts extension/tests/config-modal.test.ts
git commit -m "feat(extension): add the question count/kind config modal"
```

---

### Task 8: The batch review overlay

**Files:**
- Create: `extension/src/content/overlay/batch.ts`
- Modify: `extension/src/content/overlay/styles.ts` (append batch styles)
- Test: `extension/tests/batch.test.ts`

**Interfaces:**
- Consumes: `renderFields`, `draftToCard`, `SourceMeta` (Task 6); `initAIEditor` (Task 6); `overlayStyles`.
- Produces:
  - `BatchOverlayOptions` — `{ kind: CaptureKind; drafts: CardDraft[]; source: SourceMeta; allTags?: { id: string; name: string }[] }`
  - `BatchResult` — `{ action: "save"; cards: Record<string, unknown>[] } | { action: "cancel" }`
  - `openBatchOverlay(opts: BatchOverlayOptions): Promise<BatchResult>` — mounts a shadow host with id `recall-batch-overlay-host`.

Behaviour: each draft renders as a collapsible section; the first is expanded, the rest collapsed. Each section header shows `#N`, the kind badge, a one-line summary, a sparkle AI button, and a discard ✕. Save posts every non-discarded card. Escape cancels; Ctrl/Cmd+Enter saves.

- [ ] **Step 1: Write the failing test**

Create `extension/tests/batch.test.ts`:

```ts
import { expect, test, beforeEach } from "vitest";
import { openBatchOverlay } from "../src/content/overlay/batch";
import type { CardDraft } from "../src/shared/types";

const source = {
  type: "web" as const,
  url: "https://mdn.io/p",
  title: "T",
  siteName: "MDN",
  excerpt: "passage",
  capturedAt: "2026-07-25T00:00:00.000Z",
};

function mcq(q: string, a: string): CardDraft {
  return { kind: "mcq", question: q, answer: a, distractors: ["x", "y", "z"], tags: ["css"], explanation: "", hint: "" };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

function shadow(): ShadowRoot {
  const host = document.getElementById("recall-batch-overlay-host");
  if (!host?.shadowRoot) throw new Error("batch host not mounted");
  return host.shadowRoot;
}

test("renders one section per draft with a numbered header", () => {
  const pending = openBatchOverlay({ kind: "mcq", drafts: [mcq("Q1", "A1"), mcq("Q2", "A2")], source });
  const sections = shadow().querySelectorAll(".batch-card");
  expect(sections).toHaveLength(2);
  expect(shadow().querySelectorAll(".batch-index")[0].textContent).toBe("1");
  expect(shadow().querySelectorAll(".batch-index")[1].textContent).toBe("2");
  expect(shadow().querySelector(".batch-count")?.textContent).toBe("2 cards");
  shadow().querySelector<HTMLButtonElement>(".cancel")!.click();
  return pending;
});

test("save resolves with one POST body per kept card", async () => {
  const pending = openBatchOverlay({ kind: "mcq", drafts: [mcq("Q1", "A1"), mcq("Q2", "A2")], source });
  shadow().querySelector<HTMLButtonElement>(".save")!.click();
  const result = await pending;
  expect(result.action).toBe("save");
  if (result.action !== "save") throw new Error("expected save");
  expect(result.cards).toHaveLength(2);
  expect(result.cards[0]).toMatchObject({ kind: "mcq", question: "Q1", answer: "A1", source });
  expect(document.getElementById("recall-batch-overlay-host")).toBeNull();
});

test("discarding a card removes it from the saved set and updates the count", async () => {
  const pending = openBatchOverlay({ kind: "mcq", drafts: [mcq("Q1", "A1"), mcq("Q2", "A2")], source });
  shadow().querySelectorAll<HTMLButtonElement>(".batch-discard")[0].click();
  expect(shadow().querySelector(".batch-count")?.textContent).toBe("1 card");
  shadow().querySelector<HTMLButtonElement>(".save")!.click();
  const result = await pending;
  if (result.action !== "save") throw new Error("expected save");
  expect(result.cards).toHaveLength(1);
  expect(result.cards[0]).toMatchObject({ question: "Q2" });
});

test("cancel resolves with the cancel action and unmounts", async () => {
  const pending = openBatchOverlay({ kind: "mcq", drafts: [mcq("Q1", "A1")], source });
  shadow().querySelector<HTMLButtonElement>(".cancel")!.click();
  await expect(pending).resolves.toEqual({ action: "cancel" });
  expect(document.getElementById("recall-batch-overlay-host")).toBeNull();
});

test("save is disabled once every card is discarded", async () => {
  const pending = openBatchOverlay({ kind: "mcq", drafts: [mcq("Q1", "A1")], source });
  shadow().querySelectorAll<HTMLButtonElement>(".batch-discard")[0].click();
  expect(shadow().querySelector<HTMLButtonElement>(".save")!.disabled).toBe(true);
  expect(shadow().querySelector(".batch-count")?.textContent).toBe("0 cards");
  shadow().querySelector<HTMLButtonElement>(".cancel")!.click();
  await pending;
});

test("edits made in a card body are reflected in the saved body", async () => {
  const pending = openBatchOverlay({ kind: "mcq", drafts: [mcq("Q1", "A1")], source });
  const question = shadow().querySelector<HTMLTextAreaElement>('[data-field="question"]')!;
  question.value = "edited question";
  shadow().querySelector<HTMLButtonElement>(".save")!.click();
  const result = await pending;
  if (result.action !== "save") throw new Error("expected save");
  expect(result.cards[0]).toMatchObject({ question: "edited question" });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --dir extension test batch`
Expected: FAIL — cannot resolve `../src/content/overlay/batch`.

- [ ] **Step 3: Write `src/content/overlay/batch.ts`**

```ts
import type { CardDraft, CaptureKind } from "../../shared/types";
import { draftToCard, renderFields, type FieldsRoot, type SourceMeta } from "./fields";
import { overlayStyles } from "./styles";
import { batchStyles } from "./styles";
import { initAIEditor } from "./ai";

export interface BatchOverlayOptions {
  kind: CaptureKind;
  drafts: CardDraft[];
  source: SourceMeta;
  allTags?: { id: string; name: string }[];
}

export type BatchResult =
  | { action: "save"; cards: Record<string, unknown>[] }
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

    const heading = document.createElement("div");
    heading.className = "batch-heading";
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = opts.kind;
    const count = document.createElement("span");
    count.className = "batch-count";
    heading.append(badge, count);

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
      resolve({ action: "save", cards });
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
  });
}
```

Collapse the two `./styles` imports at the top into one line: `import { overlayStyles, batchStyles } from "./styles";`

- [ ] **Step 4: Add the batch styles**

Append to `extension/src/content/overlay/styles.ts`:

```ts
export const batchStyles = `
  .batch-heading { display: flex; align-items: center; gap: 10px; }
  .batch-count {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #B6A596;
  }
  .batch-list { display: flex; flex-direction: column; gap: 10px; }
  .batch-card { border: 1px solid #4A4441; border-radius: 4px; background: #181818; }
  .batch-card-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid #2e2927;
  }
  .batch-chevron {
    background: transparent;
    border: none;
    color: #B6A596;
    cursor: pointer;
    font-size: 12px;
    padding: 0 2px;
  }
  .batch-index {
    font-size: 10px;
    font-weight: 700;
    color: #DC9F85;
    min-width: 14px;
  }
  .batch-summary {
    flex: 1;
    font-size: 13px;
    color: #EBDCC4;
    cursor: pointer;
    line-height: 1.4;
  }
  .batch-discard {
    background: transparent;
    border: none;
    color: #B6A596;
    cursor: pointer;
    font-size: 14px;
    padding: 2px 6px;
  }
  .batch-discard:hover { color: #fda4af; }
  .batch-card-body { padding: 14px 12px; display: flex; flex-direction: column; gap: 12px; }
  .save:disabled { opacity: 0.4; cursor: not-allowed; }
`;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --dir extension test batch`
Expected: PASS, 6 tests.

- [ ] **Step 6: Typecheck and run the full extension suite**

Run: `pnpm --dir extension exec tsc --noEmit` → clean
Run: `pnpm --dir extension test` → all pass

- [ ] **Step 7: Commit**

```bash
git add extension/src/content/overlay/batch.ts extension/src/content/overlay/styles.ts extension/tests/batch.test.ts
git commit -m "feat(extension): add the batch card review overlay"
```

---

### Task 9: The `web.js` content script + build wiring

**Files:**
- Create: `extension/src/web/index.ts`
- Create: `extension/vite.web.config.ts`
- Modify: `extension/package.json:6` (build script)
- Modify: `extension/manifest.json:10-12` (content_scripts)

**Interfaces:**
- Consumes: `readSelection`/`buildWebSource` (Task 4), `openConfigModal` (Task 7), `openBatchOverlay` (Task 8), `createStatusPill` (`../content/status`), `showToast` (`../content/toast`), and the `GENERATE_QUESTIONS` / `SAVE_CARDS` / `GET_TAGS` background messages (Task 5).
- Produces: `web.js` — a self-contained IIFE content script on every non-YouTube page that responds to `{ type: "OPEN_QUESTION_MODAL" }`.

- [ ] **Step 1: Write `src/web/index.ts`**

```ts
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
  });

  if (result.action !== "save") {
    status.remove();
    return;
  }

  status.set("saving", `Saving ${result.cards.length}…`);
  const saveRes = (await chrome.runtime.sendMessage({
    type: "SAVE_CARDS",
    cards: result.cards,
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
```

- [ ] **Step 2: Create the third Vite build**

Create `extension/vite.web.config.ts`:

```ts
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Same constraint as vite.content.config.ts: MV3 injects content scripts as
// classic (non-module) scripts, so this must be a single self-contained IIFE
// with zero top-level imports in the output. One input per config, because
// `inlineDynamicImports` only supports a single entry.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false, // vite.config.ts already populated dist
    rollupOptions: {
      input: { web: resolve(__dirname, 'src/web/index.ts') },
      output: {
        entryFileNames: 'web.js',
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
    target: 'chrome120',
  },
});
```

- [ ] **Step 3: Wire it into the build script**

In `extension/package.json`, replace the `build` script with:

```json
    "build": "vite build && vite build --config vite.content.config.ts && vite build --config vite.web.config.ts && node copy-static.mjs",
```

- [ ] **Step 4: Register the second content script**

In `extension/manifest.json`, replace the `content_scripts` array (lines 10-12) with:

```json
  "content_scripts": [
    { "matches": ["https://www.youtube.com/*"], "js": ["content.js"], "run_at": "document_idle" },
    {
      "matches": ["<all_urls>"],
      "exclude_matches": ["https://www.youtube.com/*"],
      "js": ["web.js"],
      "run_at": "document_idle"
    }
  ],
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --dir extension exec tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Build and verify the artifact**

Run: `pnpm --dir extension build`
Expected: succeeds, and `extension/dist/web.js` exists.

Run: `node -e "const s=require('fs').readFileSync('extension/dist/web.js','utf8'); if(/^\s*import\s|^\s*export\s/m.test(s)) { console.error('FAIL: web.js has top-level module syntax'); process.exit(1); } console.log('OK: web.js is a self-contained classic script');"`
Expected: `OK: web.js is a self-contained classic script`

- [ ] **Step 7: Run the full extension suite**

Run: `pnpm --dir extension test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add extension/src/web/index.ts extension/vite.web.config.ts extension/package.json extension/manifest.json
git commit -m "feat(extension): ship web.js, the any-site text capture content script"
```

---

### Task 10: Manual smoke test + documentation

**Files:**
- Modify: `docs/ai-memory/02-features-log.md`
- Modify: `docs/ai-memory/03-decisions.md`
- Modify: `docs/ai-memory/04-current-state.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything from Tasks 1-9.
- Produces: no code.

**Note:** the smoke test spends real Gemini quota. `instructions.md` says the user runs money-spending smoke tests manually — hand them the checklist below, do not run it yourself.

- [ ] **Step 1: Hand the user the smoke-test checklist**

Present exactly this, and wait for their result before continuing:

```
1. npm run dev  (Recall, with GEMINI_API_KEY or Vertex ADC set)
2. pnpm --dir extension build
3. chrome://extensions → Reload "Recall Capture" (a manifest change requires a
   full reload, not just a refresh) → confirm no manifest errors.
4. Open any article page (e.g. an MDN doc). Select 2-3 paragraphs.
5. Right-click → "Add question" → the config modal appears with the selection preview.
6. Set count = 3, type = Multiple choice (1 answer) → Generate.
7. The batch overlay lists 3 cards; options render as a numbered table with a
   ✓ on exactly one option per card.
8. Edit a question, discard one card, use the per-card sparkle AI on another
   (confirm the diff pills land on THAT card, not card #1).
9. Save all → status pill reports "Saved 2 ✓".
10. In Recall, open /cards → the 2 new cards exist with the right tag, and
    /groups has NOT gained a new group.
11. Repeat step 4-9 once with type = True / False sort to check a non-table kind.
```

- [ ] **Step 2: Append the feature-log entry**

Add to `docs/ai-memory/02-features-log.md`:

```markdown
## Web text capture (any site) — 2026-07-25

Select text on any website → right-click **Add question** → choose how many
cards and which kind → Gemini drafts them from the passage → a batch overlay
lists all N for editing → Save all.

- **Files added (extension):** `src/web/selection.ts`, `src/web/config-modal.ts`,
  `src/web/index.ts`, `src/content/overlay/batch.ts`, `vite.web.config.ts`,
  `tests/selection.test.ts`, `tests/config-modal.test.ts`, `tests/batch.test.ts`,
  `tests/generate-bg.test.ts`.
- **Files added (Recall):** `lib/source.ts`, `app/api/generate/route.ts` (+ tests).
- **Files modified:** `types/index.ts` (CardSource union), `app/api/cards/validate.ts`,
  `app/api/cards/route.ts`, `lib/gemini.ts`, `extension/manifest.json`,
  `extension/package.json`, `extension/src/background.ts`,
  `extension/src/shared/types.ts`, `extension/src/content/overlay/fields.ts`,
  `extension/src/content/overlay/ai.ts`, `extension/src/content/overlay/styles.ts`.
- **New API endpoint:** `POST /api/generate` — `{ text, kind, count, pageTitle? }`
  → `{ ok, drafts: CardDraft[] }`. Count clamped to 1..20, source text to 20k chars.
- **Schema change:** `CardSource` is now `VideoSource | WebSource`. No migration
  needed — existing documents have no `type` field and read as `VideoSource`.
- **New permission:** `contextMenus`. New content script matching `<all_urls>`
  (excluding youtube.com).
- **No new env vars, no new packages.**
```

- [ ] **Step 3: Record the two architectural decisions**

Add to `docs/ai-memory/03-decisions.md`:

```markdown
- **`CardSource` is a discriminated union, and the web arm declares the video-only
  properties as `?: undefined`.** Eight call sites read `card.source?.videoId`
  directly; declaring `videoId?: undefined` on `WebSource` keeps all of them
  type-checking, so the union landed without touching analytics, groups,
  subjects, or exemptions. Use the `isVideoSource` / `isWebSource` guards from
  `lib/source.ts` anywhere you need to read `timestamp` or `screenshotUrl`.
- **The MCQ/multi "table" in the batch overlay is a CSS grid, not a `<table>`.**
  `ai.ts` inserts its diff block as a sibling of the field it replaces; inside a
  real `<tbody>` that would be a stray `<div>` between `<tr>`s. A grid row gives
  the same visual structure and leaves the existing pill insertion logic intact.
```

- [ ] **Step 4: Update the current-state doc**

In `docs/ai-memory/04-current-state.md`, add a bullet to the **Feature surface**
section right after the "YouTube capture" bullet:

```markdown
- **Web text capture** (any site): select text → right-click **Add question** →
  count + kind modal → `POST /api/generate` (Gemini, no image) → batch overlay
  listing all N drafts (MCQ/multi in a grid table, other kinds via the existing
  per-kind renderers, per-card AI editing) → one `SAVE_CARDS` round trip.
  Cards get a `{ type: "web", url, title, siteName, excerpt, capturedAt }`
  source; they never auto-create groups and never appear under analytics
  "By video".
```

Update the **Verification** section with the new counts from your actual runs,
and add to **Open items / TODO**:

```markdown
- Web-captured cards have no UI surface that shows their source page — `/cards`
  shows the frame for video sources but nothing for web sources yet.
```

- [ ] **Step 5: Document it in CLAUDE.md**

In `CLAUDE.md`, add this section immediately after the "Import view (`/import`)" section:

```markdown
## Extension capture: video vs web

The extension has two capture paths and two content scripts.

- **`content.js`** runs on `https://www.youtube.com/*`. Hotkey → frame grab →
  `POST /api/capture` (Gemini + R2) → single-card `overlay.ts` → `POST /api/cards`.
  Produces a `VideoSource`, which auto-creates a group and paints a timeline marker.
- **`web.js`** runs on `<all_urls>` except youtube.com. Context menu "Add question"
  → `readSelection()` → count/kind modal → `POST /api/generate` (Gemini, text only)
  → `batch.ts` overlay listing N drafts → one `SAVE_CARDS` message that POSTs each.
  Produces a `WebSource`, which creates no group and no marker.

Both share `fields.ts` (per-kind field rendering) and `ai.ts` (inline + global AI
editing). Two things make the sharing safe, and breaking either one breaks the
other path:

1. `renderFields(..., optionsLayout)` — `"rows"` (default, YouTube overlay) or
   `"table"` (batch overlay). Both emit `data-field="option" data-index="N"` and
   a `.option-row` class, which is what `ai.ts` keys its diff pills off.
2. `initAIEditor({ card })` scopes every field lookup to the `card` element it's
   given, not to the shadow root. The batch overlay passes each card's own
   section; the single-card overlay passes the whole modal. Never change these
   back to `shadow.querySelector` — with N cards in one shadow root every lookup
   would hit card #1.

`MarkerShape` and the per-kind shape/color map are still duplicated between
`extension/src/shared/config.ts` and `app/api/capture/route.ts` — there is no
shared build, so edit them in lockstep.
```

Also update the "Data model" section's `Card` block — replace the `source` line's
description so it reads:

```
Card.source  = VideoSource { videoId, url, timestamp, channel?, title?, screenshotUrl?, marker? }
             | WebSource   { type: "web", url, title?, siteName?, excerpt?, capturedAt }
               // narrow with isVideoSource/isWebSource from lib/source.ts
```

- [ ] **Step 6: Final verification across both projects**

Run: `npx tsc --noEmit` → clean
Run: `npx vitest run` → all pass
Run: `npm run lint` → 0 errors
Run: `pnpm --dir extension exec tsc --noEmit` → clean
Run: `pnpm --dir extension test` → all pass
Run: `pnpm --dir extension build` → succeeds

- [ ] **Step 7: Commit**

```bash
git add docs/ai-memory/02-features-log.md docs/ai-memory/03-decisions.md docs/ai-memory/04-current-state.md CLAUDE.md
git commit -m "docs: record the web text capture feature"
```
