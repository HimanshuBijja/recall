# Recall — All Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six features to Recall — Quick Test from the card browser, Flashcards, Cloze cards, Match-the-following cards, Bookmarks, and an FSRS spaced-repetition scheduler — with tests.

**Architecture:** Build on the existing MongoDB data layer (`lib/db.ts` async `readDb`/`writeDb`). Three new card kinds follow the documented "add a card kind" contract (types → cards API POST/PUT → CardForm → TestSession → ResultView → CardsBrowser → import/export). Bookmarks add a `bookmarked` flag + a `/bookmarks` page. The scheduler wraps the `ts-fsrs` library in `lib/srs.ts`, persists per-card state in a new `reviews` collection, updates it whenever any card is answered, and adds a due-review session mode plus dashboard + analytics surfacing. Pure logic (cloze parser, FSRS wrapper, rating map, session-pool selection, API validators) is unit-tested; key interactive UI (swipe, cloze inputs, match tapping) gets React Testing Library tests.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4, MongoDB, Vitest, `ts-fsrs`, `@testing-library/react` + `jsdom` (new), Axios.

## Global Constraints

- Package manager **npm**. `@/*` alias imports. TypeScript throughout; no `any` (use `unknown`/explicit types).
- **`SessionResult.correct` stays a single boolean** across all card kinds — derive it via the `overrideCorrect` arg to `recordAndAdvance`. No per-blank/per-pair/per-statement scores in the session record.
- **Analytics invariant:** accuracy uses latest-attempt-per-card; do not break it.
- New card kinds must round-trip through import/export (`lib/export.ts`, `app/api/import/route.ts`, `validateCard` in `app/import/ImportView.tsx`) and the cards API (POST validation, PUT normalization).
- No new UI/component libraries (Tailwind only; icons inline SVG). `ts-fsrs`, `@testing-library/*`, `jsdom` are the only new deps and are pre-approved by this plan.
- Data access only through `lib/db.ts`. Route Handlers export `dynamic = "force-dynamic"` where they read data. Dynamic params are awaited promises.
- No comments unless a non-obvious WHY. Mobile-first (usable at 360px), keyboard-accessible, light+dark.

## Decided defaults (overridable)

- **Cloze syntax:** `==answer==` marks a blank. Grading: case-insensitive, trimmed, **single** accepted answer per blank; **all blanks correct** ⇒ card correct.
- **Flashcards:** self-graded by swipe — right = Know it (`correct:true`, confidence 3), left = Review again (`correct:false`, confidence 1). **No** separate confidence screen. Front = `question`, back = `answer` (+ explanation).
- **Match:** 2–8 pairs; left column fixed, right column shuffled; tap-left then tap-right to link. All pairs correct ⇒ card correct.
- **Bookmarks:** boolean `bookmarked` on `Card`; **excluded from export**. Dedicated `/bookmarks` page + nav entry.
- **FSRS:** via `ts-fsrs`. Rating map: wrong ⇒ Again; correct + confidence 1/2/3 ⇒ Hard/Good/Easy. Schedule updates on **every** answered card in any session. "Due" = `dueAt <= now` in device-local time. Due queue = due/overdue + new cards, **new capped at 20/day**; when a batch is exhausted the session offers **"+20 more" or "Finish"**.
- **Kind selector:** the CardForm segmented control becomes a wrapping pill row (5 kinds).

---

## File Structure

**New**
- `lib/cloze.ts` — cloze parse + grade (pure).
- `lib/srs.ts` — `ts-fsrs` wrapper: rating map, new/apply, serialization.
- `lib/session-pool.ts` — pure pool selection (ids / tags / difficulty).
- `hooks/useSwipe.ts` — pointer-drag swipe hook (no deps).
- `hooks/useBookmarks.ts` — optional client cache of bookmark ids (thin; server is source of truth).
- `app/api/cards/[id]/bookmark/route.ts` — PATCH toggle.
- `app/api/reviews/due/route.ts` — GET due+new card ids (batched).
- `app/api/reviews/summary/route.ts` — GET due/overdue/new counts + forecast.
- `app/bookmarks/page.tsx` + `app/bookmarks/BookmarksView.tsx`.
- Tests: `lib/cloze.test.ts`, `lib/srs.test.ts`, `lib/session-pool.test.ts`, `app/api/**/*.test.ts` (extracted validators), and component tests `components/__tests__/*.test.tsx`.
- `vitest.config.ts` gains a jsdom project for component tests.

**Modified**
- `types/index.ts` — extend `CardKind`; add `clozeText?`, `pairs?`, `bookmarked?`, `MatchPair`.
- `app/api/cards/route.ts` (POST), `app/api/cards/[id]/route.ts` (PUT) — validate/normalize new kinds + `bookmarked`.
- `components/CardForm.tsx` — pill selector + branched bodies (flash/cloze/match) + validation + payload.
- `app/test/session/TestSession.tsx` — prepared-card derivation, JSX branch, keyboard, correctness, `ids=`/`due=1` modes, due-batch continue.
- `app/test/result/ResultView.tsx` — missed-row rendering per kind.
- `app/cards/CardsBrowser.tsx` — kind badges, summaries, star toggle, "Bookmarked" filter, "Test selected".
- `app/api/sessions/route.ts` — update FSRS reviews on save.
- `app/api/import/route.ts`, `app/import/ImportView.tsx` (`validateCard`), `lib/export.ts` — round-trip new fields.
- `components/Nav.tsx` — `/bookmarks` entry.
- `app/page.tsx` (dashboard) — "Review due (N)" + counts.
- `app/analytics/page.tsx` + `app/analytics/AnalyticsView.tsx` — SRS retention/forecast section.
- `package.json` — deps + scripts.

---

## Task 0: Component-test stack (jsdom + RTL)

**Files:** Modify `package.json`, `vitest.config.ts`; Create `vitest.setup.ts`.

**Interfaces:** Produces a second Vitest project running `*.test.tsx` in jsdom with `@testing-library/jest-dom` matchers, while data-layer `*.test.ts` stay on Node.

- [ ] **Step 1: Install**

```bash
npm install ts-fsrs
npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

- [ ] **Step 2: `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Replace `vitest.config.ts` with a two-project config**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    testTimeout: 20000,
    projects: [
      {
        extends: true,
        test: { name: "node", environment: "node", include: ["**/*.test.ts"], exclude: ["**/*.test.tsx"] },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
```

- [ ] **Step 4: Sanity test** — create `components/__tests__/smoke.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
test("jsdom renders", () => {
  render(<button>hi</button>);
  expect(screen.getByRole("button", { name: "hi" })).toBeInTheDocument();
});
```

- [ ] **Step 5: Run** — `npm test`; expect node + dom projects both green (existing data-layer tests + smoke). Then delete `smoke.test.tsx`.

- [ ] **Step 6: Commit** — `chore: add jsdom + RTL component-test project and ts-fsrs`.

---

## FEATURE A — Quick Test from Card Browser

### Task A1: Pure session-pool selection with `ids` support

**Files:** Create `lib/session-pool.ts`, `lib/session-pool.test.ts`.

**Interfaces:**
- Produces `selectPool(cards: Card[], opts: PoolOpts): Card[]` where
  `PoolOpts = { ids?: string[]; tagIds?: string[]; expanded?: Set<string>; minDiff: number; maxDiff: number }`.
  Precedence: `ids` (exact set, difficulty filter NOT applied) > tag/difficulty filtering.

- [ ] **Step 1: Failing test** `lib/session-pool.test.ts`

```ts
import { expect, test } from "vitest";
import { selectPool } from "@/lib/session-pool";
import type { Card } from "@/types";

const c = (id: string, tags: string[], difficulty = 3): Card => ({
  id, kind: "mcq", question: id, answer: "a", distractors: ["b","c","d"],
  explanation: "", hint: "", difficulty: difficulty as Card["difficulty"], tags, createdAt: "",
});

test("ids selects exactly those cards, ignoring difficulty", () => {
  const cards = [c("1", [], 1), c("2", [], 5), c("3", [], 3)];
  const pool = selectPool(cards, { ids: ["1","2"], minDiff: 3, maxDiff: 3 });
  expect(pool.map((p) => p.id).sort()).toEqual(["1","2"]);
});

test("tag + difficulty filtering when no ids", () => {
  const cards = [c("1", ["t"], 1), c("2", ["t"], 3), c("3", ["x"], 3)];
  const pool = selectPool(cards, { tagIds: ["t"], expanded: new Set(["t"]), minDiff: 2, maxDiff: 4 });
  expect(pool.map((p) => p.id)).toEqual(["2"]);
});

test("no filters returns all within difficulty", () => {
  const cards = [c("1", [], 1), c("2", [], 3)];
  expect(selectPool(cards, { minDiff: 2, maxDiff: 5 }).map((p)=>p.id)).toEqual(["2"]);
});
```

- [ ] **Step 2: Run → fail** (`selectPool` undefined). `npm test`.

- [ ] **Step 3: Implement `lib/session-pool.ts`**

```ts
import type { Card } from "@/types";

export interface PoolOpts {
  ids?: string[];
  tagIds?: string[];
  expanded?: Set<string>;
  minDiff: number;
  maxDiff: number;
}

export function selectPool(cards: Card[], opts: PoolOpts): Card[] {
  if (opts.ids && opts.ids.length > 0) {
    const want = new Set(opts.ids);
    return cards.filter((c) => want.has(c.id));
  }
  const inTags =
    opts.tagIds && opts.tagIds.length > 0 && opts.expanded
      ? (c: Card) => c.tags.some((t) => opts.expanded!.has(t))
      : () => true;
  return cards.filter(
    (c) => inTags(c) && c.difficulty >= opts.minDiff && c.difficulty <= opts.maxDiff
  );
}
```

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit** — `feat: pure session-pool selection with ids support`.

### Task A2: Wire `ids=` into TestSession + "Test selected" button

**Files:** Modify `app/test/session/TestSession.tsx`, `app/cards/CardsBrowser.tsx`.

**Interfaces:** Consumes `selectPool`. New URL contract `/test/session?ids=ID,ID&shuffle=true`. Precedence in the `prepared` memo: `retry` > `ids` > `tags`.

- [ ] **Step 1:** In `TestSession.tsx`, read `const idsParam = params.get("ids") ?? ""` and `const idList = idsParam.split(",").map(s=>s.trim()).filter(Boolean)`. In the `prepared` memo, replace the non-retry pool block with:

```ts
const expanded = descendantTagIds(tags, selectedTagIds);
pool = selectPool(cards, {
  ids: idList.length ? idList : undefined,
  tagIds: selectedTagIds,
  expanded,
  minDiff, maxDiff,
});
```

(import `selectPool` from `@/lib/session-pool`; keep the `retryMode` branch first.)

- [ ] **Step 2:** In `CardsBrowser.tsx` selection action bar (near the Export/Delete buttons, `CardsBrowser.tsx:150-181`), add:

```tsx
<button
  onClick={() => {
    const ids = [...selectedIds];
    if (ids.length) window.location.href = `/test/session?ids=${ids.join(",")}&shuffle=true`;
  }}
  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-950"
>
  ▶ Test
</button>
```

(Use `useRouter().push` instead of `window.location` to match the app; import already present via next/navigation? add it.)

- [ ] **Step 3: Component test** `components/__tests__/quick-test-button.test.tsx` — render `CardsBrowser` with 2 cards, select both, assert a "Test" control links to `/test/session?ids=`. (Mock `@/lib/api`.) Verify it appears only when a selection exists.
- [ ] **Step 4:** `npx tsc --noEmit` clean; `npm test` green.
- [ ] **Step 5: Commit** — `feat: quick test selected cards from browser (ids= param)`.

---

## FEATURE B — Flashcards (`kind: "flash"`)

### Task B1: Type + API validation for `flash`

**Files:** Modify `types/index.ts`, `app/api/cards/route.ts` (POST), `app/api/cards/[id]/route.ts` (PUT). Create `app/api/cards/validate.ts` + `app/api/cards/validate.test.ts` (extract the payload→Card builder so it's unit-testable).

**Interfaces:**
- `CardKind` gains `"flash"`.
- Produces `buildCardFromInput(input: unknown): { card?: Omit<Card,"id"|"createdAt">; error?: string }` used by POST/PUT. For `flash`: requires `question` and `answer`; `distractors: []`, no `statements`.

- [ ] **Step 1:** Extend `types/index.ts`:

```ts
export type CardKind = "mcq" | "tf-sort" | "flash" | "cloze" | "match";
```

- [ ] **Step 2: Failing test** `app/api/cards/validate.test.ts`

```ts
import { expect, test } from "vitest";
import { buildCardFromInput } from "@/app/api/cards/validate";

test("flash requires question and answer", () => {
  expect(buildCardFromInput({ kind: "flash", question: "Q", answer: "A" }).card?.kind).toBe("flash");
  expect(buildCardFromInput({ kind: "flash", question: "Q" }).error).toMatch(/answer/i);
});
test("mcq still needs answer", () => {
  expect(buildCardFromInput({ kind: "mcq", question: "Q" }).error).toMatch(/answer/i);
});
```

- [ ] **Step 3:** Create `app/api/cards/validate.ts` — move the POST body-construction logic here, add the `flash` branch (question+answer required; distractors `[]`; statements undefined; carry `bookmarked` if present but that lands in Task E). Return `{card}` or `{error}`.
- [ ] **Step 4:** Rewrite `POST` in `route.ts` to call `buildCardFromInput`, 400 on `error`, else push+write. Update `PUT` merge similarly (normalize by kind).
- [ ] **Step 5:** Run tests → pass; `npx tsc --noEmit` clean.
- [ ] **Step 6: Commit** — `feat: flash card kind — type + API validation`.

### Task B2: `useSwipe` hook

**Files:** Create `hooks/useSwipe.ts`, `hooks/__tests__/useSwipe.test.tsx`.

**Interfaces:** `useSwipe({ onLeft, onRight, threshold=80 })` returns `{ handlers, dx, active }` where `handlers` spreads onto a `div` (pointer events) and `dx` is current horizontal drag offset for animation.

- [ ] **Step 1: Failing test** — render a component using the hook, fire pointerdown→pointermove(+120px)→pointerup, assert `onRight` called; repeat negative for `onLeft`; below threshold calls neither.
- [ ] **Step 2: Implement** pointer-based drag (pointerdown captures start X, pointermove sets `dx`, pointerup fires `onRight` if `dx>threshold`, `onLeft` if `dx<-threshold`, resets). Respect `pointercancel`.
- [ ] **Step 3:** Run → pass. **Step 4: Commit** — `feat: useSwipe pointer hook`.

### Task B3: CardForm — flash body + pill selector

**Files:** Modify `components/CardForm.tsx`.

- [ ] **Step 1:** Change the segmented control (`CardForm.tsx:162`) to iterate all kinds `["mcq","tf-sort","flash","cloze","match"]` with a wrapping `flex flex-wrap gap-1` pill row and readable labels. (Cloze/match bodies arrive in later tasks; add their labels now but guard bodies behind `kind===` checks added per feature — for THIS task only add the `flash` body.)
- [ ] **Step 2:** Add a `flash` body branch: shows Question (front, existing `question` field) + a "Back (answer)" input bound to `answer`. Hide distractors/statements. Update `validate()`: for `flash`, require `question` and `answer`. Update the submit payload builder: `flash` sends `{kind, question, answer, distractors:[], statements:undefined, ...}`.
- [ ] **Step 3: Component test** `components/__tests__/cardform-flash.test.tsx` — switch to Flash, assert distractor inputs are gone and a Back field is present; fill question+answer, submit, assert POST body has `kind:"flash"` and `distractors:[]`. (Mock `@/lib/api`, `next/navigation`, `@/components/Toast`.)
- [ ] **Step 4:** tsc + tests. **Step 5: Commit** — `feat: flash authoring in CardForm`.

### Task B4: TestSession — flashcard play (flip + swipe self-grade)

**Files:** Modify `app/test/session/TestSession.tsx`.

**Interfaces:** Consumes `useSwipe`. In due/normal flow, a flash card: tap/Space flips; swipe right or `→`/`K` = Know (`recordAndAdvance(3,"",true)`); swipe left or `←`/`J` = Review (`recordAndAdvance(1,"",false)`). No confidence screen for flash.

- [ ] **Step 1:** Extend `PreparedCard` derivation: flash needs no options/statements. Add `isFlash = current?.card.kind === "flash"`. Add flip state `const [flipped, setFlipped] = useState(false)` reset on `idx` change.
- [ ] **Step 2:** Add a JSX branch for `isFlash`: a card showing `question` (front); when `flipped`, show `answer` + explanation. Use a CSS flip (respect `prefers-reduced-motion`). Wire `useSwipe`. Buttons "↩ Review" / "Know ✓" also call the graders (mouse fallback).
- [ ] **Step 3:** Keyboard: in the not-answered branch, when `isFlash`: `Space`→flip; `ArrowRight`/`k`→Know; `ArrowLeft`/`j`→Review. Flash never enters the confidence-screen branch (record advances immediately).
- [ ] **Step 4: Component test** `components/__tests__/session-flash.test.tsx` — render `TestSession` with one flash card (stub `useSearchParams` via ids or props), press `→`, assert the session records a correct result and advances/finishes (spy the POST or assert results UI). Also assert Space flips to reveal the answer.
- [ ] **Step 5:** tsc + tests. **Step 6: Commit** — `feat: flashcard play (flip + swipe self-grade)`.

### Task B5: Result + browser + import/export for flash

**Files:** Modify `app/test/result/ResultView.tsx`, `app/cards/CardsBrowser.tsx`, `lib/export.ts`, `app/api/import/route.ts`, `app/import/ImportView.tsx`.

- [ ] **Step 1:** ResultView missed-row: for `flash`, show `Answer: {card.answer}` (like the MCQ `Correct:` line).
- [ ] **Step 2:** CardsBrowser: add a `flash` badge ("Flash") and summary line `→ {answer}` (already the default for non-tf; add badge in the badge cluster at `CardsBrowser.tsx:257`).
- [ ] **Step 3:** export: `exportCard` already emits `kind`+`answer`; flash needs nothing new. Import `validateCard` + API: accept `kind:"flash"` (question+answer required). Add tests in `validateCard`'s branch (see ImportView) and an import-route test asserting a flash card imports.
- [ ] **Step 4:** tsc + tests. **Step 5: Commit** — `feat: flash in result/browser/import-export`.

---

## FEATURE C — Cloze (`kind: "cloze"`)

### Task C1: `lib/cloze.ts` parser + grader (pure)

**Files:** Create `lib/cloze.ts`, `lib/cloze.test.ts`.

**Interfaces:**
- `parseCloze(text): { segments: string[]; answers: string[] }` — split on `==...==`; `segments.length === answers.length + 1`; render `segments[i]` then blank `i`.
- `gradeCloze(answers: string[], filled: string[]): boolean` — all-or-nothing; case-insensitive, trimmed.

- [ ] **Step 1: Failing tests**

```ts
import { expect, test } from "vitest";
import { parseCloze, gradeCloze } from "@/lib/cloze";

test("parses ==blanks==", () => {
  const { segments, answers } = parseCloze("React by ==Facebook== in ==2013==.");
  expect(answers).toEqual(["Facebook", "2013"]);
  expect(segments).toEqual(["React by ", " in ", "."]);
});
test("no blanks -> empty answers", () => {
  expect(parseCloze("plain").answers).toEqual([]);
});
test("grade is case-insensitive + trimmed, all-or-nothing", () => {
  expect(gradeCloze(["Facebook","2013"], [" facebook ","2013"])).toBe(true);
  expect(gradeCloze(["Facebook","2013"], ["Meta","2013"])).toBe(false);
  expect(gradeCloze(["A"], [""])).toBe(false);
});
```

- [ ] **Step 2: Run → fail. Step 3: Implement**

```ts
const RE = /==(.+?)==/g;

export function parseCloze(text: string): { segments: string[]; answers: string[] } {
  const segments: string[] = [];
  const answers: string[] = [];
  let last = 0;
  for (const m of text.matchAll(RE)) {
    segments.push(text.slice(last, m.index));
    answers.push(m[1].trim());
    last = m.index + m[0].length;
  }
  segments.push(text.slice(last));
  return { segments, answers };
}

export function gradeCloze(answers: string[], filled: string[]): boolean {
  if (answers.length === 0) return false;
  return answers.every(
    (a, i) => (filled[i] ?? "").trim().toLowerCase() === a.trim().toLowerCase()
  );
}
```

- [ ] **Step 4: Run → pass. Step 5: Commit** — `feat: cloze parser + grader`.

### Task C2: Type + API validation for cloze

**Files:** Modify `types/index.ts` (add `clozeText?: string`), `app/api/cards/validate.ts` (+ test).
- [ ] cloze branch: requires `clozeText` producing ≥1 answer (`parseCloze(clozeText).answers.length >= 1`); `answer:""`, `distractors:[]`, `statements:undefined`. Add validate tests. Commit `feat: cloze type + API validation`.

### Task C3: CardForm cloze editor ("Cloze it")

**Files:** Modify `components/CardForm.tsx`.
- [ ] Add `clozeText` state. Cloze body = one textarea bound to `clozeText` + a **"Cloze it"** button that wraps the current textarea selection in `==…==` (use the textarea ref's `selectionStart/End`). Live preview renders `parseCloze` result with blanks as `____`. Validate ≥1 blank. Payload sends `{kind:"cloze", clozeText, question: clozeText or a prompt, answer:"", distractors:[]}` (store a human `question` = `clozeText` with blanks shown, so list/summary views have text). Component test: type text, select a word, click "Cloze it", assert `==word==` inserted and preview shows a blank. Commit `feat: cloze authoring`.

### Task C4: TestSession cloze play

**Files:** Modify `app/test/session/TestSession.tsx`.
- [ ] `PreparedCard` for cloze: `const parsed = parseCloze(card.clozeText ?? "")`. Per-card state `clozeFilled: string[]` (length = answers). Render segments interleaved with `<input>` blanks (inline, sized). Submit button enabled when all non-empty (or allow submit anytime = wrong). Grade `gradeCloze(parsed.answers, clozeFilled)` → `recordAndAdvance(conf,"",correct)` (still shows the 1/2/3 confidence screen after submit, like MCQ). Keyboard handler already ignores `INPUT` targets, so typing is safe; provide an explicit Submit button + Enter-to-submit when focus leaves inputs. Component test: fill blanks correctly → submit → assert correct; wrong fill → incorrect. Commit `feat: cloze play in session`.

### Task C5: Result + browser + import/export for cloze

**Files:** `ResultView.tsx`, `CardsBrowser.tsx`, `lib/export.ts`, import route + `validateCard`.
- [ ] Result missed-row for cloze: render the text with correct answers shown in-line (segments + `[answer]`). Browser badge "Cloze" + summary `→ {n} blanks`. Export: add `clozeText?` to `ExportedCard` (emit for cloze). Import/`validateCard`: accept `kind:"cloze"` requiring ≥1 blank. Tests for the round-trip + validator branch. Commit `feat: cloze in result/browser/import-export`.

---

## FEATURE D — Match (`kind: "match"`)

### Task D1: Type + API validation for match

**Files:** `types/index.ts` (add `MatchPair = { left: string; right: string }`, `pairs?: MatchPair[]`), `app/api/cards/validate.ts` (+ test).
- [ ] match branch: `pairs` normalized (trim; drop empties); require ≥2 pairs; `answer:""`, `distractors:[]`. Tests. Commit `feat: match type + API validation`.

### Task D2: CardForm match editor

**Files:** `components/CardForm.tsx`.
- [ ] `pairs` state; rows of `left | right` inputs with add/remove; min 2, max 8. Validate ≥2 filled pairs. Payload `{kind:"match", pairs, ...}`. Component test: add pairs, submit, assert POST `pairs`. Commit `feat: match authoring`.

### Task D3: TestSession match play (tap to pair)

**Files:** `app/test/session/TestSession.tsx`.
- [ ] `PreparedCard` for match: `rightOrder = shuffle(indices)`. State: `matchSel: {leftIdx|null}` and `matchLinks: Record<number, number>` (leftIdx → rightIdx). Interaction: tap a left item (highlights), then tap a right item to link (or tap-to-toggle). Show link via a number/color chip. Submit enabled when all left linked. Grade: every left `i` links to the right whose original index is `i` → `allPairsCorrect`; `recordAndAdvance(conf,"",allPairsCorrect)` after the confidence screen. Keyboard fallback optional (numbers select left, letters right) — tap is primary. Component test: link all pairs correctly → correct; mismatch → incorrect. Commit `feat: match play in session`.

### Task D4: Result + browser + import/export for match

**Files:** `ResultView.tsx`, `CardsBrowser.tsx`, `lib/export.ts`, import + `validateCard`.
- [ ] Result missed-row: list the correct `left → right` pairs. Browser badge "Match" + summary `→ {n} pairs`. Export: add `pairs?` to `ExportedCard`. Import/`validateCard`: accept `kind:"match"` (≥2 pairs). Tests. Commit `feat: match in result/browser/import-export`.

---

## FEATURE E — Bookmarks

### Task E1: `bookmarked` field + PATCH endpoint

**Files:** `types/index.ts` (`bookmarked?: boolean`), Create `app/api/cards/[id]/bookmark/route.ts` + test; ensure `buildCardFromInput`/PUT preserve `bookmarked`.

**Interfaces:** `PATCH /api/cards/:id/bookmark` body `{ bookmarked: boolean }` → sets the flag on that card only, returns the updated card. (One-field write that doesn't re-validate the whole card.)

- [ ] **Step 1: Failing test** (route-level, node): seed a card, PATCH `{bookmarked:true}`, assert persisted; PATCH false clears it; unknown id → 404.
- [ ] **Step 2: Implement** the PATCH handler (await params; read cards; find by id; set `bookmarked`; write; return card or 404).
- [ ] **Step 3:** tsc + tests. **Step 4: Commit** — `feat: bookmark PATCH endpoint`.

### Task E2: Star toggles + Cards filter + /bookmarks page + nav

**Files:** `app/cards/CardsBrowser.tsx`, `app/test/result/ResultView.tsx`, Create `app/bookmarks/page.tsx` + `app/bookmarks/BookmarksView.tsx`, `components/Nav.tsx`.

- [ ] **Step 1:** CardsBrowser: add a ⭐ toggle button on each card row (calls `api.patch(/cards/${id}/bookmark, {bookmarked:!c.bookmarked})`, optimistic update, `stopPropagation`). Add a **"Bookmarked"** filter chip to the filter row. Add a **"Test bookmarked →"** button that launches `/test/session?ids=<bookmarked ids>`.
- [ ] **Step 2:** ResultView: add a ⭐ toggle on each missed-card row.
- [ ] **Step 3:** `/bookmarks` — server page reads cards, filters `bookmarked`, passes to `BookmarksView` (reuse the card-row UI; include a "Test these" launcher). `export const dynamic = "force-dynamic"`.
- [ ] **Step 4:** `Nav.tsx` — add a Bookmarks entry (desktop header + mobile bottom nav) near Bin, with an inline star icon.
- [ ] **Step 5:** export omits `bookmarked` (leave `ExportedCard` unchanged — assert in a test that an exported card has no `bookmarked` key).
- [ ] **Step 6: Component test** `components/__tests__/bookmark-toggle.test.tsx` — click the star, assert PATCH called and the star reflects state; the "Bookmarked" filter hides non-bookmarked cards.
- [ ] **Step 7:** tsc + tests. **Step 8: Commit** — `feat: bookmarks — toggles, filter, /bookmarks page, nav`.

---

## FEATURE F — FSRS spaced-repetition scheduler

### Task F1: `lib/srs.ts` — ts-fsrs wrapper + rating map (pure)

**Files:** Create `lib/srs.ts`, `lib/srs.test.ts`; extend `types/index.ts` with a `Review` type.

**Interfaces:**
- `Review = { cardId: string; fsrs: FsrsState; dueAt: string; lastReviewedAt: string | null; firstSeenAt: string }` where `FsrsState` is the serialized `ts-fsrs` card (dates as ISO strings).
- `ratingFrom(correct: boolean, confidence: 1|2|3): Rating` — wrong→Again; 1/2/3→Hard/Good/Easy.
- `newReview(cardId, now): Review`.
- `applyReview(review, correct, confidence, now): Review` — advances FSRS, recomputes `dueAt`.
- `isDue(review, now): boolean`.

- [ ] **Step 1: Failing tests**

```ts
import { expect, test } from "vitest";
import { ratingFrom, newReview, applyReview, isDue } from "@/lib/srs";
import { Rating } from "ts-fsrs";

test("rating map", () => {
  expect(ratingFrom(false, 3)).toBe(Rating.Again);
  expect(ratingFrom(true, 1)).toBe(Rating.Hard);
  expect(ratingFrom(true, 2)).toBe(Rating.Good);
  expect(ratingFrom(true, 3)).toBe(Rating.Easy);
});

test("correct answer pushes due into the future", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const r0 = newReview("c1", now);
  const r1 = applyReview(r0, true, 3, now);
  expect(new Date(r1.dueAt).getTime()).toBeGreaterThan(now.getTime());
});

test("wrong answer keeps it due soon", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const r1 = applyReview(newReview("c1", now), true, 3, now);
  const later = new Date(r1.dueAt);
  const r2 = applyReview(r1, false, 1, later);
  expect(isDue(r2, new Date(later.getTime() + 60_000))).toBe(true);
});
```

- [ ] **Step 2: Run → fail. Step 3: Implement** using `ts-fsrs`:

```ts
import { fsrs, generatorParameters, createEmptyCard, Rating, type Card as FsrsCard } from "ts-fsrs";
import type { Review } from "@/types";

const f = fsrs(generatorParameters());

export function ratingFrom(correct: boolean, confidence: 1 | 2 | 3): Rating {
  if (!correct) return Rating.Again;
  return confidence === 1 ? Rating.Hard : confidence === 2 ? Rating.Good : Rating.Easy;
}

function serialize(c: FsrsCard) {
  return { ...c, due: c.due.toISOString(), last_review: c.last_review?.toISOString() ?? null };
}
function deserialize(s: Review["fsrs"]): FsrsCard {
  return { ...s, due: new Date(s.due), last_review: s.last_review ? new Date(s.last_review) : undefined } as FsrsCard;
}

export function newReview(cardId: string, now: Date): Review {
  const c = createEmptyCard(now);
  return { cardId, fsrs: serialize(c), dueAt: c.due.toISOString(), lastReviewedAt: null, firstSeenAt: now.toISOString() };
}

export function applyReview(r: Review, correct: boolean, confidence: 1|2|3, now: Date): Review {
  const card = deserialize(r.fsrs);
  const rating = ratingFrom(correct, confidence);
  const next = f.next(card, now, rating).card;
  return { ...r, fsrs: serialize(next), dueAt: next.due.toISOString(), lastReviewedAt: now.toISOString() };
}

export function isDue(r: Review, now: Date): boolean {
  return new Date(r.dueAt).getTime() <= now.getTime();
}
```

(Type `Review["fsrs"]` = serialized shape; declare it in `types/index.ts` to match `serialize`.)

- [ ] **Step 4: Run → pass. Step 5: Commit** — `feat: FSRS wrapper (lib/srs) + rating map`.

### Task F2: Update reviews on session save

**Files:** Modify `app/api/sessions/route.ts`. Create `lib/reviews.ts` (`updateReviewsForResults(results, now)`: read `reviews.json`, for each result upsert via `newReview`/`applyReview`, write) + `lib/reviews.test.ts`.

**Interfaces:** Consumes `newReview`/`applyReview`. On `POST /api/sessions`, after saving the session, call `await updateReviewsForResults(session.results, new Date())`.

- [ ] **Step 1: Failing test** — a fresh cardId gets a review with `dueAt` in the future after a correct result; a second result advances it. (Use in-memory Mongo like the data-layer tests.)
- [ ] **Step 2: Implement** `lib/reviews.ts` + wire into the sessions POST (after `writeDb("sessions.json", ...)`).
- [ ] **Step 3:** tsc + tests. **Step 4: Commit** — `feat: update FSRS reviews on session save`.

### Task F3: Due endpoints (batched + summary)

**Files:** Create `app/api/reviews/due/route.ts`, `app/api/reviews/summary/route.ts`, `lib/due.ts` (pure selection) + `lib/due.test.ts`.

**Interfaces:**
- `selectDue(cards, reviews, now, { newLimit, exclude }): { dueIds: string[]; newIds: string[] }` — due = reviews with `isDue`; new = cards with no review (capped by `newLimit`), minus `exclude`.
- `GET /api/reviews/due?newLimit=20&exclude=a,b` → `{ dueIds, newIds }` (non-bin cards only).
- `GET /api/reviews/summary` → `{ due, overdue, new, forecast: { date: string; count: number }[] }` for the next 14 days.

- [ ] **Step 1: Failing test** for `selectDue` (due picks overdue reviews; new respects cap + exclude). **Step 2: Implement** `lib/due.ts`. **Step 3:** implement the two routes over it. **Step 4:** tsc + tests. **Step 5: Commit** — `feat: reviews due + summary endpoints`.

### Task F4: Due-review session mode (`due=1`) with batch continue

**Files:** Modify `app/test/session/TestSession.tsx`.

**Interfaces:** New mode `?due=1`. On mount it fetches `/api/reviews/due` for the first batch (due first, then new up to 20), builds `prepared` from those ids. When the batch is exhausted, instead of finishing it shows a prompt: **"Reviewed N. Load 20 more? [Continue] [Finish]"**. Continue fetches the next batch (`exclude` = already-seen ids; bump `newLimit` by 20), appends to `prepared`. Finish saves the session and routes to results.

- [ ] **Step 1:** Add due-mode state: `dueDone` flag, `seenIds` set. In the `prepared` builder, when `due=1`, start empty and load the first batch in an effect (fetch due ids → map to cards → set prepared). Guard the "finish on last card" logic: in due mode, reaching the end sets `showBatchPrompt` instead of finishing.
- [ ] **Step 2:** Render the batch prompt (Continue / Finish). Continue: fetch next batch, append prepared, hide prompt, advance to the appended index. Finish: call the existing `finish(results)`.
- [ ] **Step 3: Component test** — mock `/api/reviews/due` to return 1 card then an empty batch; play the card; assert the prompt appears; click Finish → POST /sessions called.
- [ ] **Step 4:** tsc + tests. **Step 5: Commit** — `feat: due-review session mode with batch continue`.

### Task F5: Dashboard + Analytics SRS surfacing

**Files:** Modify `app/page.tsx` (dashboard), `app/analytics/page.tsx`, `app/analytics/AnalyticsView.tsx`.

- [ ] **Step 1:** Dashboard: fetch `/api/reviews/summary` (or read reviews server-side); render a **"Review due (N) →"** button linking `/test/session?due=1` and a small counts row (due · overdue · new).
- [ ] **Step 2:** Analytics: read `reviews.json` server-side, pass to `AnalyticsView`. Add an **SRS section**: retention (share of reviews rated ≥Good over the range) and a **due forecast** bar chart (upcoming `dueAt` bucketed by day for 14 days) using the existing Recharts `<ChartCard>` pattern.
- [ ] **Step 3: Component test** — render `AnalyticsView` with sample reviews; assert the forecast chart and retention stat render.
- [ ] **Step 4:** tsc + tests; `npm run build` is NOT required (types checked by tsc). **Step 5: Commit** — `feat: SRS dashboard launch + analytics (retention + forecast)`.

---

## Cross-cutting: docs

- [ ] After each feature merges, update `docs/ai-memory/02-features-log.md`, `04-current-state.md`, and `03-decisions.md` (per `instructions.md`), and `CLAUDE.md`'s card-kinds/analytics sections for the new kinds + scheduler. Update `README.md` if scripts/env change (none expected beyond deps).

---

## Self-Review

**Spec coverage:** Quick Test (A1–A2); Flashcards (B1–B5); Cloze (C1–C5); Match (D1–D4); Bookmarks (E1–E2); FSRS scheduler (F1–F5); test infra (Task 0). Every roadmap feature maps to tasks. ✔

**Invariants:** `SessionResult.correct` stays a single boolean — every new kind derives it via `overrideCorrect` (B4, C4, D3) and FSRS reads (correct, confidence), never a partial score. Analytics latest-per-card math is untouched; the SRS section is additive. ✔

**Type consistency:** `CardKind` extended once (Task B1) then reused; `buildCardFromInput` is the single POST/PUT builder extended per kind (B1/C2/D1/E1); `Review`/`FsrsState` defined in F1 and consumed by F2–F5; `selectPool` (A1) reused by A2 and due-mode. ✔

**Placeholders:** pure-logic/API tasks carry complete code + tests; large-component tasks give exact insertion points, the code to add, and a component test. No "TBD"/"similar to". Two deliberate deferrals are named, not hidden: keyboard fallback for match is optional; heavy per-day new-card persistence uses the simple `firstSeenAt`-per-review count.

**Open assumptions (flagged for the human, overridable):** bookmarks excluded from export; match 2–8 pairs; due batch/new-cap = 20 with "+20" continue; `dueAt <= now` device-local; cloze single-answer case-insensitive. If any is wrong, adjust the referenced task before executing.
