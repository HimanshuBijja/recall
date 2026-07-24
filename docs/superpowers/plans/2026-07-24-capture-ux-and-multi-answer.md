# Capture UX Overhaul + Multi-Answer Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the YouTube capture flow legible and fast to review — a live progress pill on hotkey, a two-column auto-growing review overlay, and MCQ options you tap to mark correct (green), with real multi-correct answers supported everywhere in the app.

**Architecture:** Two parts. **Part A** adds a new app-wide card kind `multi` (multiple correct answers, all-or-nothing scoring) so `SessionResult.correct` stays a single boolean — this follows the documented "add a new card kind" playbook (types → validate → CardForm → TestSession → Result → CardsBrowser → import/export → gemini). **Part B** overhauls the browser extension's capture UX: a stateful progress pill, a redesigned two-column overlay with auto-growing textareas, tap-to-pick-correct option tiles (1 green ⇒ saves as `mcq`, 2+ green ⇒ saves as `multi`), and a restyled popup/options page. Part B's overlay depends on Part A's `multi` kind existing in the API.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (app); MV3 extension in vanilla TS built with Vite (no framework, Shadow DOM overlay); Vitest for both. Gemini via `@google/genai`; MongoDB via `readDb`/`writeDb`.

## Global Constraints

- **`SessionResult.correct` stays a single boolean for every kind.** `multi` is scored all-or-nothing (the set of picked options must exactly equal the set of correct answers), exactly like `tf-sort`/`match`. Copied verbatim from CLAUDE.md: "Keep `SessionResult.correct` a single boolean across kinds."
- **`multi` data shape:** `answer: ""` (unused scalar), `answers: string[]` (≥1 correct options), `distractors: string[]` (≥0 wrong options). Total options = `answers.length + distractors.length` must be ≥2. Options shown to the learner are `shuffle([...answers, ...distractors])`.
- **Legacy `mcq` is untouched.** Existing `mcq` cards keep `answer: string` + `distractors: string[]`. Do not migrate them.
- **`MarkerShape` enum + per-kind shape/color map must stay byte-identical** between Recall (`types/index.ts`, `app/api/capture/route.ts`, `app/api/cards/validate.ts`) and the extension (`extension/src/shared/config.ts` `DEFAULT_SETTINGS`). There is no shared build root.
- **Next.js 16:** dynamic route params are `Promise<{...}>` and must be awaited. Read-heavy routes export `dynamic = "force-dynamic"`.
- **Extension content scripts** are built as a standalone IIFE (MV3 content scripts can't be ES modules). The overlay renders inside a Shadow DOM (`recall-capture-overlay-host`) — all styles are inline `<style>` in the shadow root, never Tailwind.
- **Client components must not import DB-touching modules.** Keep `lib/multi.ts` a pure, dependency-free helper (like `lib/cloze.ts`).
- **Money guardrail:** never invoke live Gemini/R2. All capture/gemini tests mock `@/lib/gemini` and `@/lib/storage`. The user smoke-tests the live path manually.
- **Verification:** app changes → `npx tsc --noEmit` + `npx vitest run`; extension changes → `pnpm --dir extension exec tsc --noEmit` + `pnpm --dir extension test`. Root tooling excludes `extension/`.
- **Commits on the user's name only.** No `Co-Authored-By` trailer.

## File Structure

**Part A (app):**
- `types/index.ts` — add `"multi"` to `CardKind`; add `answers?: string[]` to `Card`. (modify)
- `lib/multi.ts` — new pure `gradeMulti(correct, picked)` all-or-nothing scorer. (create)
- `lib/multi.test.ts` — unit tests. (create)
- `app/api/cards/validate.ts` — `multi` branch in `buildCardFromInput`. (modify)
- `app/api/cards/validate.test.ts` — `multi` validation tests. (modify)
- `lib/export.ts` — emit `answers` for `multi`. (modify)
- `lib/export.test.ts` — round-trip test. (modify)
- `app/api/import/route.ts` — `multi` branch + alias normalize. (modify)
- `app/import/ImportView.tsx` — `validateCard` + preview badge/summary for `multi`. (modify)
- `lib/gemini.ts` — `multi` prompt + `parseDraft` reads `answers`. (modify)
- `lib/gemini.test.ts` — `multi` parse test. (modify)
- `components/CardForm.tsx` — `multi` segmented control + editor body. (modify)
- `app/test/session/TestSession.tsx` — `multi` prepared options, pick state, scoring, JSX, keyboard. (modify)
- `app/test/result/ResultView.tsx` — `multi` missed-row rendering. (modify)
- `app/cards/CardsBrowser.tsx` — `multi` badge + summary line. (modify)
- `types/capture.ts` — add `answers?: string[]` to `CardDraft`. (modify)

**Part B (extension):**
- `extension/src/shared/types.ts` — add `"multi"` to `CaptureKind`; add `answers?` to `CardDraft`; add `multi` to `KindConfig` maps. (modify)
- `extension/src/shared/config.ts` — `DEFAULT_SETTINGS.kinds.multi`, `CAPTURE_KINDS`. (modify)
- `extension/src/content/status.ts` — new stateful progress-pill controller. (create)
- `extension/tests/status.test.ts` — pill state tests. (create)
- `extension/src/content/index.ts` — drive the pill through `runCapture` stages. (modify)
- `extension/src/content/overlay/overlay.ts` — two-column layout, restyle. (modify)
- `extension/src/content/overlay/fields.ts` — auto-grow textareas; tap-to-green option tiles; `multi` in `draftToCard`; kind promotion in `readValues`. (modify)
- `extension/tests/overlay.test.ts` — `draftToCard` multi + promotion tests. (modify)
- `extension/src/popup/popup.html` + `popup.ts` — restyle, add `multi` row. (modify)
- `extension/src/options/options.html` + `options.ts` — restyle; `multi` row already auto-renders from `CAPTURE_KINDS`. (modify)
- `app/api/capture/route.ts` — `MARKER.multi` entry. (modify)

---

## PART A — App-wide `multi` card kind

### Task A1: Types + pure scorer

**Files:**
- Modify: `types/index.ts:4` (CardKind), `types/index.ts:36-52` (Card)
- Create: `lib/multi.ts`
- Test: `lib/multi.test.ts`

**Interfaces:**
- Produces: `type CardKind = "mcq" | "tf-sort" | "flash" | "cloze" | "match" | "multi"`; `Card.answers?: string[]`; `gradeMulti(correct: string[], picked: string[]): boolean`.

- [ ] **Step 1: Write the failing test**

Create `lib/multi.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { gradeMulti } from "./multi";

describe("gradeMulti", () => {
  it("is correct only when picked set equals correct set", () => {
    expect(gradeMulti(["TCP", "UDP"], ["UDP", "TCP"])).toBe(true); // order-independent
    expect(gradeMulti(["TCP", "UDP"], ["TCP"])).toBe(false); // missing one
    expect(gradeMulti(["TCP", "UDP"], ["TCP", "UDP", "HTTP"])).toBe(false); // extra
    expect(gradeMulti(["TCP"], ["UDP"])).toBe(false);
  });
  it("trims and ignores blank picks; empty correct set is never correct", () => {
    expect(gradeMulti([" TCP ", "UDP"], ["TCP", " UDP", ""])).toBe(true);
    expect(gradeMulti([], [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/multi.test.ts`
Expected: FAIL — `Failed to resolve import "./multi"`.

- [ ] **Step 3: Create the scorer**

Create `lib/multi.ts`:

```ts
/**
 * All-or-nothing scoring for the `multi` card kind: the learner's picked
 * options must be exactly the set of correct answers — no misses, no extras.
 * Comparison is trimmed and order-independent. Kept dependency-free so it can
 * be imported by client components (see CLAUDE.md: no DB code in client bundles).
 */
export function gradeMulti(correct: string[], picked: string[]): boolean {
  const norm = (s: string) => s.trim();
  const c = new Set(correct.map(norm).filter(Boolean));
  const p = new Set(picked.map(norm).filter(Boolean));
  if (c.size === 0 || c.size !== p.size) return false;
  for (const x of c) if (!p.has(x)) return false;
  return true;
}
```

- [ ] **Step 4: Extend the types**

In `types/index.ts`, change line 4 to:

```ts
export type CardKind = "mcq" | "tf-sort" | "flash" | "cloze" | "match" | "multi";
```

In the `Card` interface (after `distractors: string[];` on line 41) add:

```ts
  /** `multi` only: the correct options (>=1). Wrong options live in `distractors`. */
  answers?: string[];
```

Also update the doc comment above `Card` (line 28-35) to add a line:

```ts
 * - "multi": multiple correct answers + distractors; scored all-or-nothing.
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/multi.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (the new optional field breaks nothing).

- [ ] **Step 7: Commit**

```bash
git add types/index.ts lib/multi.ts lib/multi.test.ts
git commit -m "feat(cards): add multi kind types + all-or-nothing scorer"
```

---

### Task A2: API validation for `multi`

**Files:**
- Modify: `app/api/cards/validate.ts:74-89` (add `multi` branch after the `mcq` branch)
- Test: `app/api/cards/validate.test.ts`

**Interfaces:**
- Consumes: `Card.answers` from A1.
- Produces: `buildCardFromInput` accepts `{ kind: "multi", question, answers, distractors }` and returns a card with `answer: ""`, `answers`, `distractors`.

- [ ] **Step 1: Write the failing test**

Add to `app/api/cards/validate.test.ts`:

```ts
describe("multi kind", () => {
  it("accepts >=1 answer and >=2 total options", () => {
    const { card, error } = buildCardFromInput({
      kind: "multi",
      question: "Which are transport-layer protocols?",
      answers: ["TCP", "UDP"],
      distractors: ["HTTP", "FTP"],
    });
    expect(error).toBeUndefined();
    expect(card).toMatchObject({ kind: "multi", answer: "", answers: ["TCP", "UDP"], distractors: ["HTTP", "FTP"] });
  });
  it("rejects zero correct answers", () => {
    const { error } = buildCardFromInput({ kind: "multi", question: "Q", answers: [], distractors: ["a", "b"] });
    expect(error).toMatch(/at least 1 correct/i);
  });
  it("rejects fewer than 2 total options", () => {
    const { error } = buildCardFromInput({ kind: "multi", question: "Q", answers: ["only"], distractors: [] });
    expect(error).toMatch(/at least 2 options/i);
  });
});
```

Confirm the file already imports `buildCardFromInput` (it does — used by existing tests). If `describe`/`it`/`expect` aren't imported, add `import { describe, expect, it } from "vitest";` at the top only if missing.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/cards/validate.test.ts`
Expected: FAIL — multi falls through to `unknown card kind: multi`.

- [ ] **Step 3: Add the `multi` branch**

In `app/api/cards/validate.ts`, immediately after the `mcq` branch closes (after line 89, before `if (kind === "tf-sort")`), insert:

```ts
  if (kind === "multi") {
    const answers = Array.isArray(body.answers)
      ? body.answers.map((s) => String(s ?? "").trim()).filter(Boolean)
      : [];
    const distractors = Array.isArray(body.distractors)
      ? body.distractors.map((s) => String(s ?? "").trim()).filter(Boolean)
      : [];
    if (answers.length < 1) {
      return { error: "multi cards need at least 1 correct answer" };
    }
    if (answers.length + distractors.length < 2) {
      return { error: "multi cards need at least 2 options total" };
    }
    return {
      card: {
        ...baseCard,
        question: String(body.question).trim(),
        answer: "",
        answers,
        distractors,
      },
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/cards/validate.test.ts`
Expected: PASS (all, including the 3 new).

- [ ] **Step 5: Commit**

```bash
git add app/api/cards/validate.ts app/api/cards/validate.test.ts
git commit -m "feat(api): validate multi cards (>=1 answer, >=2 options)"
```

---

### Task A3: Export round-trip for `multi`

**Files:**
- Modify: `lib/export.ts:3-16` (ExportedCard), `lib/export.ts:34-55` (exportCard)
- Test: `lib/export.test.ts`

**Interfaces:**
- Produces: `ExportedCard.answers?: string[]`; `exportCard` emits `answers` only for `multi`.

- [ ] **Step 1: Write the failing test**

Add to `lib/export.test.ts` (match the existing import of `exportCard`/`exportCards` and construct a minimal `Card`):

```ts
it("exports answers for multi cards and omits them otherwise", () => {
  const tagById = new Map();
  const multi = exportCard(
    { id: "1", kind: "multi", question: "Q", answer: "", answers: ["a", "b"], distractors: ["c"], explanation: "", hint: "", difficulty: 3, tags: [], createdAt: "x" },
    tagById,
  );
  expect(multi).toMatchObject({ kind: "multi", answers: ["a", "b"], distractors: ["c"], answer: "" });
  const mcq = exportCard(
    { id: "2", kind: "mcq", question: "Q", answer: "a", distractors: ["b", "c", "d"], explanation: "", hint: "", difficulty: 3, tags: [], createdAt: "x" },
    tagById,
  );
  expect(mcq.answers).toBeUndefined();
});
```

If `exportCard` isn't already imported in this test file, add it to the existing import from `./export`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/export.test.ts`
Expected: FAIL — `answers` is `undefined` on the multi export.

- [ ] **Step 3: Update `ExportedCard` and `exportCard`**

In `lib/export.ts`, add to the `ExportedCard` interface after `distractors: string[];` (line 7):

```ts
  answers?: string[];
```

In `exportCard`, add `const isMulti = card.kind === "multi";` alongside the other `is*` consts (after line 39), and add these two properties to the returned object:

```ts
    answers: isMulti && card.answers ? [...card.answers] : undefined,
    distractors: isMcq ? [...(card.distractors ?? [])] : isMulti ? [...(card.distractors ?? [])] : [],
```

(The `distractors` line replaces the existing `distractors: isMcq ? ...` line at line 45 so `multi` keeps its wrong options.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/export.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/export.ts lib/export.test.ts
git commit -m "feat(export): preserve multi answers on export"
```

---

### Task A4: Import (API route + preview) for `multi`

**Files:**
- Modify: `app/api/import/route.ts:11-25` (BundleCard), `app/api/import/route.ts:130-190` (card branches)
- Modify: `app/import/ImportView.tsx:69-115` (validateCard), `app/import/ImportView.tsx:596-616` (payload build), `app/import/ImportView.tsx:948-973` (badge + summary)

**Interfaces:**
- Consumes: the `multi` validation rules from A2 (mirror them client-side).
- Produces: pasting `{ kind: "multi", question, answers, distractors }` imports as a `multi` card; the preview shows a `MULTI` badge and `N correct` summary.

- [ ] **Step 1: Write the failing test (API)**

Add to a suitable import test. If `lib/import-dedupe.test.ts` is unit-scoped, instead add an API test to a new `app/api/import/route.test.ts` mirroring `app/api/cards/route.test.ts`'s mocking of `@/lib/db`. Minimal test body:

```ts
it("imports a multi card", async () => {
  // (reuse the readDb/writeDb mocks pattern from route.test.ts)
  const req = new Request("http://x/api/import", {
    method: "POST",
    body: JSON.stringify([{ kind: "multi", question: "Q", answers: ["a", "b"], distractors: ["c"], tags: ["net"] }]),
  });
  const res = await POST(req as never);
  const json = await res.json();
  expect(json.cards.inserted).toBe(1);
});
```

If setting up the DB mock is heavy, skip the API test and rely on A2's validator coverage + the manual round-trip check in Step 6; note this deviation in the commit.

- [ ] **Step 2: Add `multi` to the import route**

In `app/api/import/route.ts`, add `answers?: string[];` to the `BundleCard` interface (after `distractors?: string[];`, line 15). Then add a `multi` branch after the `mcq` branch (after line 137, before `else if (kind === "tf-sort")`):

```ts
    } else if (kind === "multi") {
      const answers = Array.isArray(item.answers) ? item.answers.map(String).map((s) => s.trim()).filter(Boolean) : [];
      const distractors = Array.isArray(item.distractors) ? item.distractors.map(String).map((s) => s.trim()).filter(Boolean) : [];
      if (answers.length < 1 || answers.length + distractors.length < 2) continue;
      card = {
        ...baseCard,
        question: item.question || "",
        answer: "",
        answers,
        distractors,
      };
```

- [ ] **Step 3: Update the ImportView validator + payload + preview**

In `app/import/ImportView.tsx`, add a `multi` branch to `validateCard` (after the `mcq` branch near line 79-82). Match the existing branch style — push an error string when invalid:

```tsx
    } else if (kind === "multi") {
      const answers = Array.isArray(r.answers) ? r.answers : [];
      const distractors = Array.isArray(r.distractors) ? r.distractors : [];
      if (answers.filter((a) => String(a).trim()).length < 1) errors.push("multi needs >=1 answer");
      if (answers.length + distractors.length < 2) errors.push("multi needs >=2 options");
```

In the payload builder (around line 599-613), add `answers` for multi:

```tsx
            answers: kind === "multi" && Array.isArray(r.raw.answers) ? r.raw.answers.map(String) : undefined,
```

and change the `distractors` line so `multi` keeps its distractors:

```tsx
            distractors:
              (kind === "mcq" || kind === "multi") && Array.isArray(r.raw.distractors)
                ? r.raw.distractors.map(String)
                : [],
```

In the preview badge block (around line 950-954) add:

```tsx
                            r.raw.kind === "multi" && "bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300",
```

and in the summary block (around line 969-973) add:

```tsx
                        {r.raw.kind === "multi" && `→ ${Array.isArray(r.raw.answers) ? r.raw.answers.length : 0} correct`}
```

(Verify the exact local variable names — `r`, `r.raw`, `errors`/`push` — against the file before editing; the branch shape must match its siblings.)

- [ ] **Step 4: Typecheck + run tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; all green.

- [ ] **Step 5: Commit**

```bash
git add app/api/import/route.ts app/import/ImportView.tsx
git commit -m "feat(import): accept and preview multi cards"
```

---

### Task A5: Gemini drafting for `multi`

**Files:**
- Modify: `lib/gemini.ts:49-55` (KIND_INSTRUCTIONS), `lib/gemini.ts:57-62` (emptyDraft), `lib/gemini.ts:64-91` (parseDraft)
- Modify: `types/capture.ts:3-14` (CardDraft — add `answers?`)
- Test: `lib/gemini.test.ts`

**Interfaces:**
- Consumes: `CardDraft.answers?` (added here to `types/capture.ts`).
- Produces: `parseDraft(raw, "multi")` returns `{ answers: string[], distractors: string[] }`.

- [ ] **Step 1: Write the failing test**

Add to `lib/gemini.test.ts` (it already imports `parseDraft`):

```ts
it("parses answers + distractors for multi", () => {
  const d = parseDraft(JSON.stringify({ question: "Q", answers: ["a", "b"], distractors: ["c", "d"], tags: ["x"] }), "multi");
  expect(d.kind).toBe("multi");
  expect(d.answers).toEqual(["a", "b"]);
  expect(d.distractors).toEqual(["c", "d"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/gemini.test.ts`
Expected: FAIL — `d.answers` is `undefined`.

- [ ] **Step 3: Add `answers` to `CardDraft`**

In `types/capture.ts`, add after `distractors: string[];` (line 7):

```ts
  answers?: string[];
```

- [ ] **Step 4: Teach `lib/gemini.ts` the `multi` kind**

Add to `KIND_INSTRUCTIONS` (inside the object, after the `mcq` line at line 50):

```ts
  multi: `Produce a multiple-answer question where MORE THAN ONE option is correct. JSON keys: question (the exact verbatim question text from the screenshot without rephrasing), answers (array of ALL correct option texts, 2 or more when the screenshot supports it), distractors (the remaining wrong option texts), tags (2-4 lowercase topic tags), explanation, hint.`,
```

In `emptyDraft` (line 57-62), add the multi spread:

```ts
    ...(kind === "multi" ? { answers: [] } : {}),
```

In `parseDraft`, after the `base.distractors = ...` line (line 82), add:

```ts
  if (kind === "multi") base.answers = arr(obj.answers).map(s).filter(Boolean);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/gemini.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/gemini.ts types/capture.ts lib/gemini.test.ts
git commit -m "feat(gemini): draft multi-answer cards from a frame"
```

---

### Task A6: CardForm editor for `multi`

**Files:**
- Modify: `components/CardForm.tsx` — state (line 42-44), validate (line 96-99), payload (line 146-168), segmented control (line 195-223), body (after line 298)

**Interfaces:**
- Consumes: `CardKind` includes `multi`; API accepts `{ kind: "multi", answers, distractors }`.
- Produces: a working create/edit UI for `multi` cards.

- [ ] **Step 1: Add state for answers**

In `components/CardForm.tsx`, after the `distractors` state (line 42-44) add:

```tsx
  const [answers, setAnswers] = useState<string[]>(
    initial?.answers && initial.answers.length > 0 ? initial.answers : ["", ""]
  );
  const [multiDistractors, setMultiDistractors] = useState<string[]>(
    initial?.kind === "multi" ? (initial.distractors ?? []) : [""]
  );
```

- [ ] **Step 2: Add validation**

In `validate()`, after the `mcq` block (line 96-99), add an `else if`:

```tsx
    } else if (kind === "multi") {
      const filledAnswers = answers.filter((a) => a.trim());
      const filledDistractors = multiDistractors.filter((d) => d.trim());
      if (filledAnswers.length < 1) e.answers = "At least 1 correct answer required";
      else if (filledAnswers.length + filledDistractors.length < 2) e.answers = "At least 2 options total required";
```

- [ ] **Step 3: Add to the payload**

In the `payload` object (line 146-168), add:

```tsx
        answers:
          kind === "multi" ? answers.map((a) => a.trim()).filter(Boolean) : undefined,
```

and change the `distractors` line so `multi` sends its distractors:

```tsx
        distractors:
          kind === "mcq"
            ? distractors.map((d) => d.trim())
            : kind === "multi"
            ? multiDistractors.map((d) => d.trim()).filter(Boolean)
            : [],
```

- [ ] **Step 4: Add the segmented-control option**

In the segmented control array (line 195-201) add after `["mcq", "Multiple choice"],`:

```tsx
            ["multi", "Multiple answers"],
```

And add a helper line in the description block (after the `mcq` line at line 218):

```tsx
          {kind === "multi" && "One question, several correct answers — scored all-or-nothing."}
```

- [ ] **Step 5: Add the editor body**

After the `mcq` body block closes (after line 298, the `</>` closing the `{kind === "mcq" && (...)}`), insert:

```tsx
      {kind === "multi" && (
        <>
          <Field label="Correct answers (tap + adds more)" error={errors.answers}>
            <div className="space-y-2">
              {answers.map((a, i) => (
                <div key={i} className="flex items-stretch gap-2">
                  <span className="flex items-center px-2 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-semibold shrink-0">
                    ✓
                  </span>
                  <input
                    value={a}
                    onChange={(e) => {
                      const n = [...answers];
                      n[i] = e.target.value;
                      setAnswers(n);
                    }}
                    placeholder={`Correct answer ${i + 1}`}
                    className={inputCls + " flex-1"}
                  />
                  <button
                    type="button"
                    onClick={() => { if (answers.length > 1) setAnswers(answers.filter((_, j) => j !== i)); }}
                    disabled={answers.length <= 1}
                    className="shrink-0 px-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-rose-600 hover:border-rose-300 disabled:opacity-40"
                    aria-label={`Remove correct answer ${i + 1}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setAnswers([...answers, ""])}
                className="text-xs px-2.5 py-1.5 rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-emerald-400 hover:text-emerald-600"
              >
                + Add correct answer
              </button>
            </div>
          </Field>

          <Field label="Distractors (wrong options)">
            <div className="space-y-2">
              {multiDistractors.map((d, i) => (
                <div key={i} className="flex items-stretch gap-2">
                  <input
                    value={d}
                    onChange={(e) => {
                      const n = [...multiDistractors];
                      n[i] = e.target.value;
                      setMultiDistractors(n);
                    }}
                    placeholder={`Distractor ${i + 1}`}
                    className={inputCls + " flex-1"}
                  />
                  <button
                    type="button"
                    onClick={() => setMultiDistractors(multiDistractors.filter((_, j) => j !== i))}
                    className="shrink-0 px-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-rose-600 hover:border-rose-300"
                    aria-label={`Remove distractor ${i + 1}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setMultiDistractors([...multiDistractors, ""])}
                className="text-xs px-2.5 py-1.5 rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-indigo-400 hover:text-indigo-600"
              >
                + Add distractor
              </button>
            </div>
          </Field>
        </>
      )}
```

- [ ] **Step 6: Manual verify + typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (No unit test for the form — it's covered by TestSession/validate tests and manual use. Verify in-app: create a multi card, edit it, confirm it saves and reloads with the right answers/distractors.)

- [ ] **Step 7: Commit**

```bash
git add components/CardForm.tsx
git commit -m "feat(cardform): author multi-answer cards"
```

---

### Task A7: TestSession — answer, score, and render `multi`

**Files:**
- Modify: `app/test/session/TestSession.tsx` — prepared options (line 82-88 and 143-147), state (after line 116), flags (after line 192), reset effect (line 216-240), answered (line 213), scoring in keyboard + confidence, JSX branch (before the final MCQ `else` at line 878), keyboard handler (line 412-417 area).

**Interfaces:**
- Consumes: `gradeMulti` from `lib/multi.ts`; `Card.answers`.
- Produces: a `multi` card can be answered (multi-select), submitted, scored all-or-nothing, and shows correct options green.

- [ ] **Step 1: Import the scorer**

At the top of `TestSession.tsx`, add to the imports (near line 10):

```tsx
import { gradeMulti } from "@/lib/multi";
```

- [ ] **Step 2: Build options for `multi`**

The prepared-card `options` ternary appears twice (line 82-88 `initialPrepared`, and line 143-147 `loadDueBatch`). In BOTH, replace the `options:` expression with:

```tsx
        options:
          card.kind === "tf-sort" || card.kind === "flash" || card.kind === "cloze" || card.kind === "match"
            ? []
            : card.kind === "multi"
            ? shuffleArr([...(card.answers ?? []), ...card.distractors])
            : shuffleArr([card.answer, ...card.distractors]),
```

- [ ] **Step 3: Add per-card state**

After the match state block (after line 118), add:

```tsx
  const [multiPicked, setMultiPicked] = useState<Set<string>>(new Set());
  const [multiSubmitted, setMultiSubmitted] = useState(false);
```

- [ ] **Step 4: Add flags + correctness**

After `const isMatch = ...` (line 192), add:

```tsx
  const isMulti = current?.card.kind === "multi";
  const multiCorrect = isMulti && gradeMulti(current!.card.answers ?? [], Array.from(multiPicked));
```

Update the `answered` line (line 213) to include multi:

```tsx
  const answered = isTfSort ? tfSubmitted : isFlash ? flipped : isCloze ? clozeSubmitted : isMatch ? !!matchAllMatched : isMulti ? multiSubmitted : picked !== null;
```

- [ ] **Step 5: Reset per-card state**

In the reset effect (line 216-240), add near the other resets:

```tsx
    setMultiPicked(new Set());
    setMultiSubmitted(false);
```

- [ ] **Step 6: Keyboard — pick + submit**

In the keyboard handler, the MCQ number-pick block is `else if (e.key >= "1" && e.key <= "4")` (line 412-417). Add a `multi` branch BEFORE it (still inside the `!answered` block, so it wins for multi cards):

```tsx
        } else if (isMulti) {
          if (e.key >= "1" && e.key <= "9") {
            const i = Number(e.key) - 1;
            if (i < current.options.length) {
              e.preventDefault();
              const opt = current.options[i];
              setMultiPicked((prev) => {
                const n = new Set(prev);
                if (n.has(opt)) n.delete(opt); else n.add(opt);
                return n;
              });
            }
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (multiPicked.size > 0) setMultiSubmitted(true);
          } else if (e.key.toLowerCase() === "h") {
            if (current.card.hint) { e.preventDefault(); setHintShown((s) => !s); }
          } else if (e.key.toLowerCase() === "s") {
            e.preventDefault();
            setMultiSubmitted(true);
          }
```

In the answered-branch confidence keys (`e.key >= "1" && e.key <= "3"` block at line 437-448), add a `multi` case alongside the others:

```tsx
          } else if (isMulti) {
            recordAndAdvance(Number(e.key) as Confidence, "", multiCorrect);
```

Add `isMulti, multiPicked, multiCorrect` to the keyboard effect's dependency array (line 453).

- [ ] **Step 7: Render the `multi` option tiles**

The final MCQ render is the `) : (` ... `)}` at lines 878-919. Add a `multi` branch BEFORE it — change line 878 from `) : (` to `) : isMulti ? (` and insert this block, then keep the existing MCQ block as the trailing `) : (`:

```tsx
        ) : isMulti ? (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
              Select all that apply
            </p>
            <div className="grid sm:grid-cols-2 gap-2 sm:gap-2.5">
              {current.options.map((opt, i) => {
                const isCorrect = (current.card.answers ?? []).includes(opt);
                const isPicked = multiPicked.has(opt);
                const showResult = multiSubmitted;
                return (
                  <button
                    key={opt}
                    onClick={() => {
                      if (multiSubmitted) return;
                      setMultiPicked((prev) => {
                        const n = new Set(prev);
                        if (n.has(opt)) n.delete(opt); else n.add(opt);
                        return n;
                      });
                    }}
                    disabled={showResult}
                    className={[
                      "group text-left px-4 py-3 rounded-lg border transition-all flex items-start gap-3",
                      !showResult && isPicked && "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-indigo-200 dark:ring-indigo-900",
                      !showResult && !isPicked && "border-zinc-300 dark:border-zinc-700 hover:border-indigo-500 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20",
                      showResult && isCorrect && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60",
                      showResult && !isCorrect && isPicked && "border-rose-500 bg-rose-50 dark:bg-rose-950/60",
                      showResult && !isCorrect && !isPicked && "border-zinc-200 dark:border-zinc-800 opacity-50",
                    ].filter(Boolean).join(" ")}
                  >
                    <span
                      className={[
                        "shrink-0 w-6 h-6 inline-flex items-center justify-center rounded border text-xs font-mono font-semibold",
                        !showResult && isPicked && "bg-indigo-600 border-indigo-600 text-white",
                        !showResult && !isPicked && "border-zinc-300 dark:border-zinc-600 text-transparent",
                        showResult && isCorrect && "bg-emerald-600 border-emerald-600 text-white",
                        showResult && !isCorrect && isPicked && "bg-rose-600 border-rose-600 text-white",
                        showResult && !isCorrect && !isPicked && "border-zinc-300 dark:border-zinc-700 text-transparent",
                      ].filter(Boolean).join(" ")}
                    >
                      ✓
                    </span>
                    <span className="flex-1">{opt}</span>
                    <kbd className="shrink-0 text-[10px] text-zinc-400 font-mono">{i + 1}</kbd>
                  </button>
                );
              })}
            </div>
            {!multiSubmitted && (
              <button
                type="button"
                onClick={() => setMultiSubmitted(true)}
                disabled={multiPicked.size === 0}
                className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                Submit ({multiPicked.size} selected)
              </button>
            )}
          </div>
        ) : (
```

- [ ] **Step 8: Post-answer correctness + confidence for multi**

In the post-answer IIFE (line 941-948), extend `cardCorrect`:

```tsx
          const cardCorrect = isTfSort
            ? tfAllCorrect
            : isCloze
            ? clozeAllCorrect
            : isMatch
            ? matchAllCorrect
            : isMulti
            ? multiCorrect
            : picked === current.card.answer;
```

In the confidence buttons `onClick` (line 1008-1016), add the multi case:

```tsx
                      isTfSort
                        ? recordAndAdvance(c, "", tfAllCorrect)
                        : isCloze
                        ? recordAndAdvance(c, "", clozeAllCorrect)
                        : isMatch
                        ? recordAndAdvance(c, "", matchAllCorrect)
                        : isMulti
                        ? recordAndAdvance(c, "", multiCorrect)
                        : recordAndAdvance(c, picked!)
```

- [ ] **Step 9: Keyboard hints (optional polish)**

In the keyboard-hints footer (line 1066-1070, the MCQ `else`), you may add a multi hint before it:

```tsx
            ) : isMulti ? (
              <span><Kbd>1</Kbd>–<Kbd>9</Kbd> toggle · <Kbd>Enter</Kbd> submit</span>
            ) : (
```

(change the preceding `) : (` for MCQ to `) : isMulti ? (...) : (`).

- [ ] **Step 10: Typecheck + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; all green.

- [ ] **Step 11: Commit**

```bash
git add app/test/session/TestSession.tsx
git commit -m "feat(session): answer + score multi-answer cards"
```

---

### Task A8: Result view + CardsBrowser for `multi`

**Files:**
- Modify: `app/test/result/ResultView.tsx:158-207` (missed-row branches)
- Modify: `app/cards/CardsBrowser.tsx:283-333` (badge + summary)

**Interfaces:**
- Consumes: `Card.answers`.
- Produces: a missed `multi` card lists its correct answers (green); the cards list shows a `MULTI` badge + `N correct` summary.

- [ ] **Step 1: Result view missed-row rendering**

In `ResultView.tsx`, the missed-row uses a chain of `card.kind === ...` ternaries ending in the generic `Correct: {answer}` (line 201-207). Add a `multi` branch before the final `: (` (after the `match` branch at line 191-200):

```tsx
                  ) : card.kind === "multi" && card.answers ? (
                    <div className="text-xs flex flex-wrap gap-1 mt-1">
                      <span className="text-zinc-500 mr-1">Correct:</span>
                      {card.answers.map((a, j) => (
                        <span
                          key={j}
                          className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-medium border border-emerald-200 dark:border-emerald-900"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  ) : (
```

- [ ] **Step 2: CardsBrowser badge**

In `CardsBrowser.tsx`, near the kind badges (line 283-307), add a `multi` badge matching the sibling pattern (use the same JSX shape as the `tf-sort`/`flash` badges — copy one and adapt):

```tsx
                    {c.kind === "multi" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 font-semibold">
                        MULTI
                      </span>
                    )}
```

- [ ] **Step 3: CardsBrowser summary line**

In the summary block (line 329-333), add before or after the mcq line:

```tsx
                  {c.kind === "multi" && `→ ${(c.answers?.length ?? 0)} correct`}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/test/result/ResultView.tsx app/cards/CardsBrowser.tsx
git commit -m "feat(ui): show multi answers in result + cards list"
```

---

## PART B — Extension capture UX overhaul

### Task B1: Extension knows the `multi` kind

**Files:**
- Modify: `extension/src/shared/types.ts:1` (CaptureKind), `:25-36` (CardDraft add `answers?`)
- Modify: `extension/src/shared/config.ts:5-11` (DEFAULT_SETTINGS.kinds), `:14` (CAPTURE_KINDS)
- Modify: `app/api/capture/route.ts:9-15` (MARKER map)

**Interfaces:**
- Produces: `CaptureKind` includes `"multi"`; `CardDraft.answers?: string[]`; a marker for `multi` present in both the extension defaults and the capture route.

- [ ] **Step 1: Extend extension types**

In `extension/src/shared/types.ts` line 1:

```ts
export type CaptureKind = "mcq" | "flash" | "cloze" | "tf-sort" | "match" | "multi";
```

In `CardDraft` (line 25-36) add after `distractors: string[];`:

```ts
  answers?: string[];
```

- [ ] **Step 2: Extend defaults + kind list**

In `extension/src/shared/config.ts`, add to `DEFAULT_SETTINGS.kinds` (after the `match` line at line 10):

```ts
    multi: { shortcut: "Alt+Shift+A", marker: { shape: "circle", color: "#06b6d4" }, visible: true },
```

And update `CAPTURE_KINDS` (line 14):

```ts
export const CAPTURE_KINDS: CaptureKind[] = ["mcq", "multi", "flash", "cloze", "tf-sort", "match"];
```

- [ ] **Step 3: Add the capture-route marker**

In `app/api/capture/route.ts`, add to the `MARKER` map (after the `match` line at line 14):

```ts
  multi: { shape: "circle", color: "#06b6d4" },
```

> Note: `MARKER` is typed `Record<CardKind, ...>`, so once `CardKind` includes `multi` (Task A1) this entry is required — tsc will enforce it.

- [ ] **Step 4: Verify types both sides**

Run: `npx tsc --noEmit && pnpm --dir extension exec tsc --noEmit`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add extension/src/shared/types.ts extension/src/shared/config.ts app/api/capture/route.ts
git commit -m "feat(extension): register the multi capture kind + marker"
```

---

### Task B2: Stateful capture progress pill

**Files:**
- Create: `extension/src/content/status.ts`
- Test: `extension/tests/status.test.ts`

**Interfaces:**
- Produces:
  - `type CaptureStage = "capturing" | "generating" | "ready" | "saving" | "saved" | "queued" | "error"`
  - `createStatusPill(): StatusHandle` where `StatusHandle = { set(stage: CaptureStage, message?: string): void; remove(): void; el: HTMLElement }`
  - The pill shows a spinner for in-progress stages (`capturing`/`generating`/`saving`) and auto-removes ~1.4s after a terminal stage (`ready`/`saved`/`queued`/`error`).

- [ ] **Step 1: Write the failing test**

Create `extension/tests/status.test.ts`:

```ts
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createStatusPill, STAGE_TEXT } from "../src/content/status";

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
});
afterEach(() => vi.useRealTimers());

test("pill mounts, reflects stage text, and auto-removes after a terminal stage", () => {
  const pill = createStatusPill();
  pill.set("capturing");
  expect(pill.el.textContent).toContain(STAGE_TEXT.capturing);
  expect(document.body.contains(pill.el)).toBe(true);

  pill.set("generating");
  expect(pill.el.textContent).toContain(STAGE_TEXT.generating);

  pill.set("error", "boom");
  expect(pill.el.textContent).toContain("boom");
  vi.advanceTimersByTime(2000);
  expect(document.body.contains(pill.el)).toBe(false);
});

test("in-progress stages do not auto-remove", () => {
  const pill = createStatusPill();
  pill.set("generating");
  vi.advanceTimersByTime(5000);
  expect(document.body.contains(pill.el)).toBe(true);
  pill.remove();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir extension exec vitest run tests/status.test.ts`
Expected: FAIL — cannot resolve `../src/content/status`.

- [ ] **Step 3: Implement the pill**

Create `extension/src/content/status.ts`:

```ts
export type CaptureStage =
  | "capturing"
  | "generating"
  | "ready"
  | "saving"
  | "saved"
  | "queued"
  | "error";

export const STAGE_TEXT: Record<CaptureStage, string> = {
  capturing: "Capturing frame…",
  generating: "Generating card (AI)…",
  ready: "Card ready — review below",
  saving: "Saving…",
  saved: "Saved ✓",
  queued: "Server offline — queued",
  error: "Capture failed",
};

const IN_PROGRESS: CaptureStage[] = ["capturing", "generating", "saving"];
const TERMINAL: CaptureStage[] = ["ready", "saved", "queued", "error"];

export interface StatusHandle {
  set(stage: CaptureStage, message?: string): void;
  remove(): void;
  el: HTMLElement;
}

export function createStatusPill(): StatusHandle {
  const el = document.createElement("div");
  el.setAttribute("data-recall-status", "");
  el.style.cssText = [
    "position:fixed", "top:72px", "left:50%", "transform:translateX(-50%)",
    "z-index:2147483647", "display:flex", "align-items:center", "gap:10px",
    "padding:10px 16px", "border-radius:999px",
    "font:600 13px/1.2 Roboto,Arial,sans-serif", "color:#fff",
    "background:#111", "box-shadow:0 6px 20px rgba(0,0,0,.45)",
    "opacity:0", "transition:opacity .18s ease",
  ].join(";");

  const spinner = document.createElement("span");
  spinner.style.cssText = [
    "width:14px", "height:14px", "border-radius:50%",
    "border:2px solid rgba(255,255,255,.3)", "border-top-color:#fff",
    "animation:recall-spin .7s linear infinite", "flex:0 0 auto",
  ].join(";");

  const label = document.createElement("span");

  // keyframes live in a <style> appended once
  if (!document.getElementById("recall-status-kf")) {
    const kf = document.createElement("style");
    kf.id = "recall-status-kf";
    kf.textContent = "@keyframes recall-spin{to{transform:rotate(360deg)}}";
    (document.head ?? document.documentElement).appendChild(kf);
  }

  el.append(spinner, label);
  (document.body ?? document.documentElement).appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = "1"; });

  let removeTimer: ReturnType<typeof setTimeout> | null = null;

  function remove(): void {
    if (removeTimer) { clearTimeout(removeTimer); removeTimer = null; }
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 200);
  }

  function set(stage: CaptureStage, message?: string): void {
    label.textContent = message ?? STAGE_TEXT[stage];
    const inProgress = IN_PROGRESS.includes(stage);
    spinner.style.display = inProgress ? "" : "none";
    el.style.background = stage === "error" ? "#b00020" : stage === "saved" || stage === "ready" ? "#16a34a" : "#111";
    if (removeTimer) { clearTimeout(removeTimer); removeTimer = null; }
    if (TERMINAL.includes(stage) && stage !== "ready") {
      removeTimer = setTimeout(remove, 1400);
    }
  }

  return { set, remove, el };
}
```

> Note the `ready` stage does NOT auto-remove here — `runCapture` removes it explicitly when the overlay opens (Task B3). The test only asserts auto-remove for `error`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir extension exec vitest run tests/status.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/src/content/status.ts extension/tests/status.test.ts
git commit -m "feat(extension): stateful capture progress pill"
```

---

### Task B3: Drive the pill through `runCapture`

**Files:**
- Modify: `extension/src/content/index.ts:1-7` (import), `:38-100` (runCapture)

**Interfaces:**
- Consumes: `createStatusPill` from B2.
- Produces: on hotkey/popup capture, the pill shows `capturing` → `generating` → (`ready`, then overlay opens) → on save `saving` → `saved`/`queued`; errors set `error`.

- [ ] **Step 1: Import the pill**

Add to `extension/src/content/index.ts` imports (after line 7):

```ts
import { createStatusPill } from "./status";
```

- [ ] **Step 2: Wire the stages into `runCapture`**

Rewrite `runCapture` (line 38-100) so a single pill instance tracks the flow. Replace the existing `showToast(...)` calls for the capture flow with pill stages (keep `showToast` only for the "Not on a video page" guard before the pill exists):

```ts
async function runCapture(kind: CaptureKind): Promise<void> {
  const meta = getPageMeta(location, document);
  const video = getPlayerVideo();
  if (!meta || !video) {
    showToast("Not on a video page", true);
    return;
  }

  const pill = createStatusPill();
  pill.set("capturing");

  let frameDataUrl: string;
  try {
    frameDataUrl = captureFrame(video);
  } catch {
    pill.set("error", "Couldn't capture frame");
    return;
  }
  const timestamp = video.currentTime;
  video.pause();

  const s = await currentSettings();
  const req: CaptureRequest = {
    kind, videoId: meta.videoId, url: meta.url, title: meta.title,
    channel: meta.channel, timestamp, frameDataUrl,
  };

  pill.set("generating");
  const res = await requestDraft(req);
  if (!res.ok || !res.draft) {
    pill.set("error", res.error ?? "Draft failed");
    return;
  }

  pill.set("ready");
  pill.remove(); // overlay takes over the screen

  const source = { videoId: meta.videoId, url: meta.url, timestamp, channel: meta.channel, title: meta.title };
  const result = await openOverlay({
    kind,
    draft: res.draft,
    screenshotUrl: res.screenshotUrl,
    marker: res.marker ?? s.kinds[kind].marker,
    source,
    frameDataUrl,
    onRephrase: async (): Promise<CardDraft> => {
      const rephrased = await requestDraft(req);
      return rephrased.draft ?? res.draft!;
    },
  });

  if (result.action === "save") {
    const savePill = createStatusPill();
    savePill.set("saving");
    const saveRes = (await chrome.runtime.sendMessage({ type: "SAVE_CARD", card: result.card })) as
      | { ok: true; card: unknown }
      | { ok: false; queued: true }
      | { ok: false; error: string };
    if (saveRes.ok) {
      savePill.set("saved", `Saved ${result.card.kind ?? kind}`);
      void refreshMarkers();
    } else if ("queued" in saveRes && saveRes.queued) {
      savePill.set("queued");
    } else {
      savePill.set("error", "Save failed");
    }
  }
}
```

> `result.card.kind` may differ from the hotkey `kind` now (mcq can be promoted to multi in the overlay — Task B4). The save message + `saved` label reflect the actual saved kind. `result.card` is `Record<string, unknown>`, so read `kind` defensively (`result.card.kind as string | undefined`); adjust the cast to satisfy tsc.

- [ ] **Step 3: Typecheck**

Run: `pnpm --dir extension exec tsc --noEmit`
Expected: clean. (Fix the `result.card.kind` access with a cast if tsc complains.)

- [ ] **Step 4: Commit**

```bash
git add extension/src/content/index.ts
git commit -m "feat(extension): show capture progress states end-to-end"
```

---

### Task B4: Overlay fields — auto-grow textareas + tap-to-green options + multi promotion

**Files:**
- Modify: `extension/src/content/overlay/fields.ts` — `draftToCard` (line 11-35), `textarea` helper (line 55-59), `renderFields` mcq branch (line 84-91) and `readValues` (line 156-180)
- Test: `extension/tests/overlay.test.ts`

**Interfaces:**
- Consumes: `CardDraft.answers?` (B1).
- Produces:
  - `draftToCard` emits `answers` when `draft.kind === "multi"` (and keeps `distractors`).
  - For mcq/multi capture, `renderFields` renders option tiles; tapping toggles a green "correct" state.
  - `readValues` returns `kind: "mcq"` when exactly 1 option is green (that option → `answer`, rest → `distractors`), or `kind: "multi"` when ≥2 are green (greens → `answers`, rest → `distractors`).
  - Textareas auto-grow to fit content.

- [ ] **Step 1: Write the failing tests**

Add to `extension/tests/overlay.test.ts`:

```ts
import { draftToCard } from "../src/content/overlay/fields";

test("draftToCard emits answers + distractors for multi", () => {
  const body = draftToCard(
    { kind: "multi", question: "Q", answer: "", answers: ["a", "b"], distractors: ["c"], tags: [], explanation: "", hint: "" },
    { videoId: "v", url: "u", timestamp: 1 },
    undefined,
    undefined,
  );
  expect(body).toMatchObject({ kind: "multi", answers: ["a", "b"], distractors: ["c"] });
});
```

For the promotion logic, add a `renderFields` DOM test (jsdom is configured). Because `renderFields` reads live DOM, assert via `readValues()`:

```ts
import { renderFields } from "../src/content/overlay/fields";

test("mcq stays mcq with one green, promotes to multi with two", () => {
  const root = document.createElement("div");
  const fields = renderFields(
    "mcq",
    { kind: "mcq", question: "Q", answer: "Paris", distractors: ["London", "Berlin", "Madrid"], tags: [], explanation: "", hint: "" },
    root,
  );
  // The AI's answer is green by default → exactly one → mcq.
  let v = fields.readValues();
  expect(v.kind).toBe("mcq");
  expect(v.answer).toBe("Paris");
  // Tap a second option green by clicking its correct-toggle (data-role="toggle").
  const toggles = root.querySelectorAll<HTMLElement>('[data-role="toggle"]');
  // Click the toggle for "London" (index 1 in answer+distractors order is not guaranteed;
  // find by adjacent text input value).
  const rows = root.querySelectorAll<HTMLElement>('[data-role="option-row"]');
  for (const row of rows) {
    const input = row.querySelector("input") as HTMLInputElement;
    if (input.value === "London") (row.querySelector('[data-role="toggle"]') as HTMLElement).click();
  }
  v = fields.readValues();
  expect(v.kind).toBe("multi");
  expect(new Set(v.answers)).toEqual(new Set(["Paris", "London"]));
  expect(new Set(v.distractors)).toEqual(new Set(["Berlin", "Madrid"]));
  void toggles;
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir extension exec vitest run tests/overlay.test.ts`
Expected: FAIL — `draftToCard` doesn't emit `answers`; `renderFields` has no option toggles / no promotion.

- [ ] **Step 3: `draftToCard` — emit `answers` for multi**

In `extension/src/content/overlay/fields.ts`, in `draftToCard` (line 17-34), add after the `body` object is built (before the kind-specific ifs at line 31):

```ts
  if (draft.kind === "multi") body.answers = draft.answers ?? [];
```

(The existing `distractors: draft.distractors` line already carries wrong options.)

- [ ] **Step 4: Auto-grow textarea helper**

Replace the `textarea` helper (line 55-59) with:

```ts
function autoGrow(t: HTMLTextAreaElement): void {
  t.style.height = "auto";
  t.style.height = `${t.scrollHeight}px`;
}

function textarea(value: string, placeholder: string): HTMLTextAreaElement {
  const t = el("textarea", { placeholder, rows: "2", style: "width:100%;box-sizing:border-box;resize:none;overflow:hidden;" });
  t.value = value;
  t.addEventListener("input", () => autoGrow(t));
  // grow once after it's in the DOM
  requestAnimationFrame(() => autoGrow(t));
  return t;
}
```

- [ ] **Step 5: Replace the mcq body with tap-to-green option tiles**

In `renderFields`, the current `mcq` branch (line 84-91) renders `answer` + 3 distractor inputs. Replace it so BOTH `mcq` and `multi` render a unified list of option rows, each with a green toggle, a text input, and a remove button. Add module-level state for the option model.

Replace the `mcq` branch (`if (kind === "mcq") { ... }`) with:

```ts
  // mcq + multi share one option editor: each option is a row with a
  // green "correct" toggle. 1 green -> saves as mcq; 2+ green -> saves as multi.
  let optionRows: { input: HTMLInputElement; toggle: HTMLButtonElement; correct: boolean }[] = [];
  let optionsContainer: HTMLElement | null = null;

  if (kind === "mcq" || kind === "multi") {
    optionsContainer = el("div", { class: "recall-options", style: "display:flex;flex-direction:column;gap:6px;" });

    const addOption = (text: string, correct: boolean) => {
      const input = input_(text, "Option");
      input.style.flex = "1";
      const toggle = el("button", { type: "button", "data-role": "toggle", title: "Mark correct" }) as HTMLButtonElement;
      const row = { input, toggle, correct };
      const paint = () => {
        toggle.textContent = row.correct ? "✓" : "○";
        toggle.style.cssText = [
          "cursor:pointer", "border:none", "border-radius:6px", "min-width:34px",
          "font-size:14px", "font-weight:700",
          row.correct ? "background:#16a34a" : "background:#3f3f3f",
          row.correct ? "color:#fff" : "color:#bbb",
        ].join(";");
        input.style.outline = row.correct ? "1px solid #16a34a" : "none";
      };
      toggle.addEventListener("click", () => { row.correct = !row.correct; paint(); });
      const remove = el("button", { type: "button" }, ["✕"]) as HTMLButtonElement;
      remove.style.cssText = "cursor:pointer;border:none;border-radius:6px;background:#2b2b2b;color:#bbb;min-width:30px;";
      remove.addEventListener("click", () => {
        optionRows = optionRows.filter((r) => r !== row);
        rowEl.remove();
      });
      const rowEl = el("div", { "data-role": "option-row", style: "display:flex;gap:6px;align-items:center;" }, [toggle, input, remove]);
      paint();
      optionRows.push(row);
      optionsContainer!.append(rowEl);
    };

    // Seed from the draft: the AI's `answer`/`answers` become green options.
    const correctSeed = kind === "multi" ? (draft.answers ?? []) : (draft.answer ? [draft.answer] : []);
    for (const a of correctSeed) addOption(a, true);
    for (const d of draft.distractors) addOption(d, false);
    if (optionRows.length === 0) { addOption("", true); addOption("", false); }

    const addBtn = el("button", { type: "button" }, ["+ Add option"]) as HTMLButtonElement;
    addBtn.style.cssText = "cursor:pointer;border:1px dashed #3f3f3f;background:#2b2b2b;color:#ccc;border-radius:6px;padding:5px;font-size:12px;align-self:flex-start;";
    addBtn.addEventListener("click", () => addOption("", false));

    root.append(el("label", {}, ["Options — tap ○ to mark correct (green)"]), optionsContainer, addBtn);
  }
```

> Rename the existing `input()` helper usage to avoid the local `input` variable shadowing it: keep the helper named `input` but reference it as `input_` here, OR rename the helper. Simplest: add `const input_ = input;` right after the `input` helper definition (line 65) and use `input_` inside `addOption`. Verify no other code breaks.

Then in the kind-specific declarations at the top of `renderFields` (line 77-82), the `answerField` / `distractorFields` for mcq are no longer used — remove `let answerField ...` and `const distractorFields ...` only if nothing else references them (the `flash`/`tf-sort` branches use `answerField` — keep `answerField` declared, just don't assign it in the mcq path).

- [ ] **Step 6: Update `readValues` for mcq/multi promotion**

In `readValues` (line 156-180), replace the mcq-specific reads. The base object currently sets `answer: answerField?.value ?? ""` and `distractors: distractorFields.map(...)`. Change the return so mcq/multi derive from `optionRows`:

```ts
    readValues(): CardDraft {
      const tags = tagsField.value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);

      if (kind === "mcq" || kind === "multi") {
        const filled = optionRows.map((r) => ({ text: r.input.value.trim(), correct: r.correct })).filter((o) => o.text);
        const greens = filled.filter((o) => o.correct).map((o) => o.text);
        const reds = filled.filter((o) => !o.correct).map((o) => o.text);
        const promoted = greens.length >= 2;
        return {
          kind: promoted ? "multi" : "mcq",
          question: questionField.value,
          answer: promoted ? "" : (greens[0] ?? ""),
          answers: promoted ? greens : undefined,
          distractors: promoted ? reds : filled.filter((o) => o.text !== (greens[0] ?? "")).map((o) => o.text),
          tags,
          explanation: explanationField.value,
          hint: hintField.value,
        };
      }

      const base: CardDraft = {
        kind,
        question: kind === "cloze" ? "" : questionField.value,
        answer: answerField?.value ?? "",
        distractors: [],
        tags,
        explanation: explanationField.value,
        hint: hintField.value,
      };
      if (kind === "cloze") base.clozeText = questionField.value;
      if (kind === "tf-sort") base.statements = statementRows.map((r) => ({ text: r.textInput.value, isTrue: r.isTrue }));
      if (kind === "match") base.pairs = pairRows.map((r) => ({ left: r.leftInput.value, right: r.rightInput.value }));
      return base;
    },
```

> For the mcq (non-promoted) `distractors`, the intent: everything that isn't the single correct answer is a distractor. The expression above computes that. If zero options are green, `answer` is `""` and all filled options become distractors — the API will reject it (`answer required`), which is acceptable; the overlay's Save could also guard (optional polish).

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --dir extension exec vitest run tests/overlay.test.ts`
Expected: PASS (all, including the 2 new).

- [ ] **Step 8: Typecheck**

Run: `pnpm --dir extension exec tsc --noEmit`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add extension/src/content/overlay/fields.ts extension/tests/overlay.test.ts
git commit -m "feat(extension): tap-to-pick-correct options + auto-grow fields + mcq→multi promotion"
```

---

### Task B5: Overlay two-column layout + restyle

**Files:**
- Modify: `extension/src/content/overlay/overlay.ts:31-73` (styles + structure)

**Interfaces:**
- Consumes: `renderFields` (B4) renders into `fieldsRoot`.
- Produces: a wider overlay that lays the frame + fields in two columns on desktop widths, single column when narrow.

- [ ] **Step 1: Widen the card + add a grid**

In `overlay.ts`, update the `.card` style rule (line 34) to be wider:

```
      .card { background:#1f1f1f; color:#f1f1f1; width:min(900px,96vw); max-height:90vh; overflow:auto; border-radius:12px; padding:18px; box-shadow:0 10px 40px rgba(0,0,0,.6); }
      .grid { display:grid; grid-template-columns:1fr; gap:16px; }
      @media (min-width:720px){ .grid { grid-template-columns:minmax(0,340px) minmax(0,1fr); align-items:start; } }
      .col-frame { display:flex; flex-direction:column; gap:8px; }
      .col-fields { display:flex; flex-direction:column; }
```

Also enlarge the inputs slightly (line 38):

```
      textarea, input { background:#2b2b2b; color:#f1f1f1; border:1px solid #3f3f3f; border-radius:6px; padding:8px; font-size:14px; line-height:1.4; }
```

- [ ] **Step 2: Restructure the card into two columns**

Currently `badge`, `img.frame`, `fieldsRoot`, `actions` all append directly to `card`. Restructure (line 54-94 region) so the badge stays on top, then a `.grid` holds the frame (left) and the fields (right), then actions:

```ts
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = opts.kind;
    badge.style.background = opts.marker?.color ?? "#3ea6ff";
    badge.style.color = "#0f0f0f";
    card.append(badge);

    const grid = document.createElement("div");
    grid.className = "grid";
    const colFrame = document.createElement("div");
    colFrame.className = "col-frame";
    const colFields = document.createElement("div");
    colFields.className = "col-fields";
    grid.append(colFrame, colFields);
    card.append(grid);

    if (opts.frameDataUrl) {
      const img = document.createElement("img");
      img.className = "frame";
      img.src = opts.frameDataUrl;
      img.alt = "Captured frame";
      colFrame.append(img);
    }

    const fieldsRoot = document.createElement("div");
    colFields.append(fieldsRoot);
```

Everywhere the code later does `card.insertBefore(fieldsRoot, actions)` (the Undo handler, line 115) change it to keep `fieldsRoot` inside `colFields` — since `renderFields` clears and refills `fieldsRoot` in place, the Undo handler can simply call `renderFields(opts.kind, originalDraft, fieldsRoot)` without re-inserting. Update the Undo handler (line 113-116):

```ts
    undoBtn.addEventListener("click", () => {
      fields = renderFields(opts.kind, originalDraft, fieldsRoot);
    });
```

`actions` still appends to `card` (below the grid) — leave that as is (line 93-94).

- [ ] **Step 3: Typecheck + run overlay tests**

Run: `pnpm --dir extension exec tsc --noEmit && pnpm --dir extension exec vitest run tests/overlay.test.ts`
Expected: clean; PASS (structure change doesn't affect `draftToCard`/`readValues` tests, which use `renderFields` into a bare root).

- [ ] **Step 4: Commit**

```bash
git add extension/src/content/overlay/overlay.ts
git commit -m "feat(extension): two-column review overlay"
```

---

### Task B6: Popup restyle + `multi` row

**Files:**
- Modify: `extension/src/popup/popup.html:6-38` (styles), `extension/src/popup/popup.ts` (renders from `CAPTURE_KINDS`, already picks up `multi`)

**Interfaces:**
- Consumes: `CAPTURE_KINDS` (now includes `multi` — B1). No JS change needed for the row; `popup.ts` loops `CAPTURE_KINDS`.
- Produces: a wider, higher-contrast popup with larger tap targets.

- [ ] **Step 1: Restyle the popup**

In `extension/src/popup/popup.html`, replace the `<style>` body (line 6-38) with a wider layout and bigger buttons:

```html
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; width: 320px; font-family: Roboto, Arial, sans-serif; background: #0f0f0f; color: #f1f1f1; }
      main { padding: 16px 18px; }
      h1 { font-size: 13px; margin: 0 0 12px; text-transform: uppercase; letter-spacing: .04em; color: #9ca3af; }
      .kind-row { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #1f1f1f; }
      .kind-row:last-child { border-bottom: none; }
      .kind-name { font-size: 14px; text-transform: capitalize; font-weight: 500; }
      .capture-btn { cursor: pointer; border: none; border-radius: 8px; padding: 8px 14px; font-size: 12px; font-weight: 600; background: #3ea6ff; color: #000; min-height: 36px; }
      .capture-btn:hover { background: #58b4ff; }
      input[type="checkbox"] { width: 18px; height: 18px; accent-color: #3ea6ff; cursor: pointer; }
      .actions { display: flex; gap: 10px; margin-top: 16px; }
      .actions button { flex: 1; cursor: pointer; border: none; border-radius: 8px; padding: 10px; font-size: 12px; font-weight: 600; min-height: 40px; }
      .open-recall { background: #3ea6ff; color: #000; }
      .settings { background: #1f1f1f; color: #f1f1f1; border: 1px solid #333; }
    </style>
```

- [ ] **Step 2: Verify popup renders `multi`**

`popup.ts` already builds one row per `CAPTURE_KINDS` entry, so `multi` appears automatically. No JS change. If the label should read "multiple answers" instead of "multi", that's cosmetic (skip unless desired).

- [ ] **Step 3: Typecheck**

Run: `pnpm --dir extension exec tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add extension/src/popup/popup.html
git commit -m "feat(extension): restyle popup with larger tap targets"
```

---

### Task B7: Options page restyle

**Files:**
- Modify: `extension/src/options/options.html:6-60` (styles)

**Interfaces:**
- Consumes: `options.ts` renders a row per `CAPTURE_KINDS` (picks up `multi` automatically).
- Produces: a cleaner settings page consistent with the popup/overlay palette.

- [ ] **Step 1: Restyle**

In `extension/src/options/options.html`, tighten the `<style>` (line 6-60) — bump input sizes and row spacing (keep the `.kind-row` grid columns intact so `options.ts` layout still aligns):

```html
      input[type="text"], input[type="url"], select {
        width: 100%; background: #2b2b2b; color: #f1f1f1; border: 1px solid #3f3f3f;
        border-radius: 8px; padding: 9px 11px; font-size: 14px; min-height: 40px;
      }
```

(Add `select` to that selector so the shape dropdown matches. Keep the rest of the stylesheet; only widen inputs and, optionally, bump `main { max-width: 820px; }`.)

- [ ] **Step 2: Verify the `multi` row appears**

`options.ts` loops `CAPTURE_KINDS`, so the `multi` row with shape/color/shortcut/visible controls renders automatically. Confirm `validateShortcut` accepts the default `Alt+Shift+A` (it requires Alt or Ctrl+Shift and a non-reserved key — `a` is not in `RESERVED_BARE_KEYS`, and `alt+shift+a` isn't reserved). ✓

- [ ] **Step 3: Typecheck + full extension test + build**

Run: `pnpm --dir extension exec tsc --noEmit && pnpm --dir extension test && pnpm --dir extension build`
Expected: clean; all tests pass; build OK (`extension/dist` produced).

- [ ] **Step 4: Commit**

```bash
git add extension/src/options/options.html
git commit -m "feat(extension): restyle options page inputs"
```

---

### Task B8: Docs + final verification

**Files:**
- Modify: `docs/ai-memory/02-features-log.md`, `docs/ai-memory/04-current-state.md`, `docs/ai-memory/03-decisions.md`, `CLAUDE.md` (card-kinds section)

- [ ] **Step 1: Full verification (both sides)**

Run:
```bash
npx tsc --noEmit && npx vitest run
pnpm --dir extension exec tsc --noEmit && pnpm --dir extension test && pnpm --dir extension build
```
Expected: app tsc clean, app vitest all pass; extension tsc clean, extension vitest all pass, build OK.

- [ ] **Step 2: Update the AI-memory docs**

- `03-decisions.md`: add a dated entry — "Added `multi` card kind (multi-answer, all-or-nothing) rather than overloading `mcq`; overlay promotes mcq→multi when ≥2 options are marked correct." Record the `multi` data shape (`answers[]` + `distractors[]`, `answer:""`).
- `02-features-log.md`: log files added/modified, the new `multi` kind, the capture progress pill, the two-column overlay, tap-to-green options, popup/options restyle.
- `04-current-state.md`: add `multi` to the card-kinds list; note the extension capture UX overhaul; refresh the verification line with the new test counts.

- [ ] **Step 3: Update CLAUDE.md**

In the card-kinds intro paragraph and the "Add a new card kind" checklist, add `multi` alongside the others so the canonical conventions stay in sync with the code.

- [ ] **Step 4: Commit**

```bash
git add docs/ai-memory CLAUDE.md
git commit -m "docs: record multi kind + capture UX overhaul"
```

---

## Self-Review

**Spec coverage:**
- "No feedback on hotkey; want a toast/state showing processing/extracting" → Tasks B2 (pill + states) + B3 (wired through capture). States defined: capturing / generating / ready / saving / saved / queued / error. ✓
- "UI of questions not good" → Tasks B4 (fields) + B5 (two-column overlay). ✓
- "MCQ: tap to choose correct option, support multiple, correct turns green" → B4 (tap-to-green tiles, promotion) built on Part A (`multi` kind everywhere). ✓
- "Improve extension UI" → B5 (overlay), B6 (popup), B7 (options). ✓
- "Text boxes too small; auto-expand to text" → B4 Step 4 (auto-grow textareas) + B5 (bigger inputs). ✓
- "Two-column since on computer" → B5. ✓
- "Multi-answer everywhere" (user choice) → Part A (types, validate, export, import, gemini, CardForm, TestSession, Result, CardsBrowser). ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N" — code blocks are provided for each code step. Two spots explicitly flag "verify the exact local variable names against the file before editing" (ImportView `validateCard`, and the `input`/`input_` shadowing in fields.ts) because those depend on identifiers not fully quoted in this plan — the implementer must confirm them, which is a real instruction, not a placeholder.

**Type consistency:** `CardKind`/`CaptureKind` both gain `"multi"`. `Card.answers?`, `CardDraft.answers?` (both `types/capture.ts` and `extension/src/shared/types.ts`), `ExportedCard.answers?` all `string[] | undefined`. `gradeMulti(correct, picked)` signature is used identically in A1 (def), A7 (TestSession). `createStatusPill()`/`StatusHandle.set(stage, message?)` consistent across B2/B3. Marker `multi: { shape:"circle", color:"#06b6d4" }` identical in `app/api/capture/route.ts`, extension `DEFAULT_SETTINGS`.

**Known ordering constraint:** Part A must land before Task B4's multi promotion can save successfully against the live API, and before B1's `MARKER`/`CardKind` typecheck passes. Execute Part A → Part B in order.
