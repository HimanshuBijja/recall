# Recall Analytics Fixes + Import Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix incorrect/broken analytics (wrong numbers, empty/mis-bucketed charts), add a per-video "learning by source" metric, and improve `/import` (accept more paste formats for the newer kinds, dedupe against existing cards, bulk-tag on import, clearer preview).

**Architecture:** Analytics math is pure and derived in `AnalyticsView.tsx` from `cardHistory`/`latestPerCard`; the SRS forecast is pure in `lib/due.ts`. This plan first **lifts the pure metric logic out of the component into `lib/analytics.ts`** so it can be unit-tested, then fixes defects test-first and adds the new metric. Import work extends the existing `ImportView.tsx` validator + `app/api/import/route.ts` and adds a client-side dedupe/bulk-tag layer over the current `parseBundle` codepath.

**Tech Stack:** Next.js 16, React 19, Recharts, MongoDB Atlas via `readDb`/`writeDb`, Vitest + Testing Library.

## Global Constraints

- Analytics invariant (do NOT break): accuracy uses **latest attempt per card**, not lifetime averages. Confidence calibration + total time use **all attempts**. Best score + accuracy trend use **per-session `score`**. Trend = per-card latest-vs-prior (+1/0/−1) averaged ×100.
- `SessionResult.correct` is a single boolean across kinds. Metrics must stay kind-agnostic.
- Data access only via `lib/db.ts`; read-heavy routes export `dynamic = "force-dynamic"`. Next 16 dynamic params are awaited promises.
- Hand-rolled Tailwind v4, `useToast()`, skeleton loaders; match existing code (no shadcn/RHF/Zod).
- Import validator branches on `kind` and MUST stay in sync with `app/api/import/route.ts` (both accept the same shapes for mcq/tf-sort/flash/cloze/match).
- Commits: author = the user only, no Co-Authored-By trailer. Verify with `npx tsc --noEmit`, `npm run lint`, `npx vitest run`. No prod build unless asked.
- **Depends on Plan 1 (`2026-07-24-youtube-capture-extension.md`) for the per-video metric only** (needs `Card.source`). Do Task AN4 after Plan 1 Task A1, or stub `Card.source` first. All other tasks are independent of Plan 1.

---

## File Structure

**Analytics:**
- Create: `lib/analytics.ts` — pure metric functions lifted from `AnalyticsView` (`buildCardHistory`, `latestPerCard`, `overallAccuracy`, `tagTrend`, `srsRetention`, `perVideoStats`).
- Create: `lib/analytics.test.ts` — unit tests for the above.
- Modify: `AnalyticsView.tsx` — consume `lib/analytics.ts` (delete the inlined copies), add per-video chart + empty states.
- Modify: `lib/due.ts` — forecast day-bucketing fix (local timezone) + empty-state safety.
- Modify: `app/page.tsx` — dashboard weak-tags sidebar reuses `lib/analytics.ts` (kill the duplicate).

**Import:**
- Modify: `app/import/ImportView.tsx` — `validateCard` accepts the newer shapes; add dedupe + bulk-tag UI over `parseBundle`.
- Create: `lib/import-dedupe.ts` — pure `findDuplicates(incoming, existing)` + `applyBulkTags`.
- Create: `lib/import-dedupe.test.ts`.
- Modify: `app/api/import/route.ts` — accept the same broadened shapes; ignore unknown keys safely.

---

## PHASE AN — Analytics

### Task AN1: Lift pure metrics into `lib/analytics.ts` (no behavior change)

**Files:**
- Create: `lib/analytics.ts`, `lib/analytics.test.ts`
- Modify: `app/analytics/AnalyticsView.tsx` (replace inlined logic with imports)

**Interfaces:**
- Produces (all pure):
  - `type Attempt = { cardId: string; correct: boolean; timeTaken: number; confidence: 1|2|3 }`
  - `buildCardHistory(sessions: Session[]): Map<string, { result: SessionResult; t: string }[]>` — oldest→newest per card.
  - `latestPerCard(history): Map<string, SessionResult>`
  - `overallAccuracy(history): number` — round(correctLatest/attempted×100), 0 when none.
  - `cardTrend(hist: {result:SessionResult}[]): -1|0|1|null` — latest-vs-prior; null when <2 attempts.
  - `tagTrend(cardIds: string[], history): number|null` — mean of per-card `cardTrend` ×100, rounded; null when no card has ≥2 attempts.

- [ ] **Step 1: Write failing tests** for the pure functions (the value is a *characterization* test that pins current-correct behavior):

```ts
// lib/analytics.test.ts
import { expect, test } from "vitest";
import { buildCardHistory, latestPerCard, overallAccuracy, cardTrend, tagTrend } from "@/lib/analytics";
import type { Session } from "@/types";

const S = (id: string, at: string, results: [string, boolean][]): Session => ({
  id, tagIds: [], score: 0, completedAt: at,
  results: results.map(([cardId, correct]) => ({ cardId, correct, timeTaken: 1000, confidence: 2 })),
});

test("latest attempt wins for accuracy", () => {
  const sessions = [S("a","2026-01-01",[["c1",false]]), S("b","2026-01-02",[["c1",true]])];
  const h = buildCardHistory(sessions);
  expect(latestPerCard(h).get("c1")!.correct).toBe(true);
  expect(overallAccuracy(h)).toBe(100);
});

test("overallAccuracy is 0 with no attempts", () => {
  expect(overallAccuracy(new Map())).toBe(0);
});

test("cardTrend compares latest vs prior", () => {
  expect(cardTrend([{result:{cardId:"c",correct:false,timeTaken:1,confidence:1}},{result:{cardId:"c",correct:true,timeTaken:1,confidence:1}}])).toBe(1);
  expect(cardTrend([{result:{cardId:"c",correct:true,timeTaken:1,confidence:1}}])).toBeNull();
});

test("tagTrend averages per-card trend ×100", () => {
  const sessions = [S("a","2026-01-01",[["c1",false]]), S("b","2026-01-02",[["c1",true]])];
  const h = buildCardHistory(sessions);
  expect(tagTrend(["c1"], h)).toBe(100);
  expect(tagTrend(["cX"], h)).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run lib/analytics.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement `lib/analytics.ts`** by extracting the exact logic currently in `AnalyticsView.tsx:86-129` (`cardHistory`, `latestPerCard`, accuracy) and the trend logic used by the tag table. Keep semantics identical.

```ts
import type { Session, SessionResult } from "@/types";

export type HistEntry = { result: SessionResult; t: string };
export type CardHistory = Map<string, HistEntry[]>;

export function buildCardHistory(sessions: Session[]): CardHistory {
  const m: CardHistory = new Map();
  for (const s of sessions) {
    for (const r of s.results ?? []) {
      const arr = m.get(r.cardId) ?? [];
      arr.push({ result: r, t: s.completedAt });
      m.set(r.cardId, arr);
    }
  }
  for (const h of m.values()) h.sort((a, b) => a.t.localeCompare(b.t));
  return m;
}

export function latestPerCard(h: CardHistory): Map<string, SessionResult> {
  const m = new Map<string, SessionResult>();
  for (const [cid, hist] of h) if (hist.length) m.set(cid, hist[hist.length - 1].result);
  return m;
}

export function overallAccuracy(h: CardHistory): number {
  const latest = [...latestPerCard(h).values()];
  if (!latest.length) return 0;
  return Math.round((latest.filter((r) => r.correct).length / latest.length) * 100);
}

export function cardTrend(hist: { result: SessionResult }[]): -1 | 0 | 1 | null {
  if (hist.length < 2) return null;
  const latest = hist[hist.length - 1].result.correct ? 1 : 0;
  const prior = hist[hist.length - 2].result.correct ? 1 : 0;
  return (latest - prior) as -1 | 0 | 1;
}

export function tagTrend(cardIds: string[], h: CardHistory): number | null {
  const trends: number[] = [];
  for (const id of cardIds) {
    const t = cardTrend(h.get(id) ?? []);
    if (t !== null) trends.push(t);
  }
  if (!trends.length) return null;
  return Math.round((trends.reduce((a, b) => a + b, 0) / trends.length) * 100);
}
```

- [ ] **Step 4: Run to verify it passes** — Run: `npx vitest run lib/analytics.test.ts` — Expected: PASS.

- [ ] **Step 5: Refactor `AnalyticsView.tsx`** to import `buildCardHistory`/`latestPerCard`/`overallAccuracy`/`tagTrend` and delete the inlined duplicates. Keep the `useMemo` wrappers calling the lib fns. Do the same for the dashboard weak-tags block in `app/page.tsx`.

- [ ] **Step 6: Verify no UI regression** — Run: `npx vitest run components/__tests__/analytics.test.tsx` and `npx tsc --noEmit` — Expected: PASS + exit 0.

- [ ] **Step 7: Commit**

```bash
git add lib/analytics.ts lib/analytics.test.ts app/analytics/AnalyticsView.tsx app/page.tsx
git commit -m "refactor(analytics): lift pure metrics into lib/analytics with tests"
```

---

### Task AN2: Diagnose the "numbers wrong / charts empty" reports

**Files:**
- Create: `docs/superpowers/notes/2026-07-24-analytics-findings.md` (findings log)

**Interfaces:**
- Produces: a written, reproduced list of concrete defects, each with: symptom, the exact line, root cause, and the fix task it maps to (AN3 forecast, or a new sub-task). This task is diagnosis; it writes no product code. Use superpowers:systematic-debugging.

- [ ] **Step 1: Reproduce with a fixture.** Build a small `sessions.json`/`cards.json`/`reviews.json` fixture (or use real exported data) and, for each stat card + chart, compute the value by hand and compare to what `AnalyticsView` renders. Record mismatches.
- [ ] **Step 2: Audit the known-suspect spots** and record findings for each:
  - **Forecast bucketing** — `lib/due.ts` `getUtcDateString` buckets by UTC; for a non-UTC user the 14-day bars land on the wrong day and "today" can double-count. (→ AN3.)
  - **`avgTime`/`totalTime`** — confirm avg uses latest-per-card and total uses all attempts (per invariant); record if reversed.
  - **Confidence calibration** — confirm it uses ALL attempts (not latest) and that empty buckets render as 0, not `NaN`/blank bars.
  - **Trend badges** — confirm sign matches "latest worse than prior = negative".
  - **Empty range** — with `range=7d` and no recent sessions, confirm charts show an empty state, not a broken axis or `Math.max(...[])` → `-Infinity` (see `bestScore` at `AnalyticsView.tsx:127`).
- [ ] **Step 3: Write `2026-07-24-analytics-findings.md`** listing confirmed defects + fix mapping. For any defect beyond the forecast + `-Infinity` guard, append a fix sub-task to this plan (same TDD shape as AN3).
- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/notes/2026-07-24-analytics-findings.md
git commit -m "docs(analytics): reproduced findings for wrong/empty metrics"
```

---

### Task AN3: Fix forecast day-bucketing + empty-state guards

**Files:**
- Modify: `lib/due.ts` (forecast) — Test: `lib/due.test.ts`
- Modify: `app/analytics/AnalyticsView.tsx` (`bestScore` guard + empty chart states)

**Interfaces:**
- Produces: `getReviewsSummary` forecast buckets by the **viewer's local day** (stable, no double-count of "today"); `bestScore` is `0` (not `-Infinity`) when there are no sessions; charts render an explicit empty state when their series is empty.

- [ ] **Step 1: Write failing test** — a review due later today (local) lands in the `i=0` bucket and is not also counted on day 1:

```ts
// lib/due.test.ts (add)
import { getReviewsSummary } from "@/lib/due";
import type { Card, Review } from "@/types";

test("forecast buckets a due-today review once, by local day", () => {
  const now = new Date("2026-03-10T20:00:00"); // local
  const cards: Card[] = [{ id: "c1", kind: "flash", question: "Q", answer: "A", distractors: [], explanation: "", hint: "", difficulty: 3, tags: [], createdAt: "" }];
  const reviews: Review[] = [{ cardId: "c1", dueAt: new Date("2026-03-10T23:00:00").toISOString(), lastReviewedAt: null, firstSeenAt: "",
    fsrs: { stability: 1, difficulty: 1, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 1, lapses: 0, state: 1, last_review: null, due: "" } }];
  const s = getReviewsSummary(cards, reviews, now);
  expect(s.forecast[0].count).toBe(1);   // today
  expect(s.forecast[1].count).toBe(0);   // tomorrow, not double-counted
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run lib/due.test.ts` — Expected: FAIL (UTC bucketing off-by-one at 23:00 local when UTC rolls the date).

- [ ] **Step 3: Fix `lib/due.ts`** — replace `getUtcDateString` with a local-day key and compare due dates by local day:

```ts
const localDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// in the loop: dayStr = localDayKey(targetDay);
// and bucket by: localDayKey(new Date(r.dueAt)) === dayStr  (for i>0)
```

Keep `i===0` as the `due` count (everything due now-or-earlier).

- [ ] **Step 4: Run to verify it passes** — Run: `npx vitest run lib/due.test.ts` — Expected: PASS.

- [ ] **Step 5: Guard `-Infinity` + empty charts** in `AnalyticsView.tsx`: change `bestScore` to `filteredSessions.length ? Math.max(...) : 0` (verify it already guards; if not, fix). For each `<ChartCard>` whose series is empty, render a centered "No data in this range" block instead of the chart. Add a component test:

```tsx
// components/__tests__/analytics-empty.test.tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { AnalyticsView } from "@/app/analytics/AnalyticsView";

test("empty data shows empty states, not broken numbers", () => {
  render(<AnalyticsView sessions={[]} cards={[]} tags={[]} reviews={[]} />);
  expect(screen.queryByText(/-Infinity|NaN/)).toBeNull();
});
```

- [ ] **Step 6: Run to verify it passes** — Run: `npx vitest run components/__tests__/analytics-empty.test.tsx` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/due.ts lib/due.test.ts app/analytics/AnalyticsView.tsx components/__tests__/analytics-empty.test.tsx
git commit -m "fix(analytics): local-day forecast buckets + empty-state guards"
```

> Add one AN3-style task per additional defect confirmed in AN2, each: failing test → fix → passing test → commit.

---

### Task AN4: New metric — learning by video source

**Files:**
- Modify: `lib/analytics.ts` (`perVideoStats`) — Test: `lib/analytics.test.ts`
- Modify: `app/analytics/AnalyticsView.tsx` (new "By video" chart/section)

**Depends on:** Plan 1 Task A1 (`Card.source`). If running first, add `source?: CardSource` to `Card` per that task before starting.

**Interfaces:**
- Produces: `perVideoStats(cards: Card[], history: CardHistory): { videoId: string; title: string; total: number; correct: number; accuracy: number }[]` — groups cards by `source.videoId` (skips cards without a source), accuracy = latest-per-card correct / attempted, sorted by accuracy asc (weakest videos first).

- [ ] **Step 1: Write failing test**

```ts
// lib/analytics.test.ts (add)
import { perVideoStats, buildCardHistory } from "@/lib/analytics";
import type { Card, Session } from "@/types";

test("perVideoStats groups by source video, weakest first", () => {
  const cards = [
    { id: "c1", source: { videoId: "v1", url: "", timestamp: 0, title: "Intro" } },
    { id: "c2", source: { videoId: "v1", url: "", timestamp: 0, title: "Intro" } },
    { id: "c3", source: { videoId: "v2", url: "", timestamp: 0, title: "Advanced" } },
    { id: "c4" },
  ] as Card[];
  const sessions = [{ id: "s", tagIds: [], score: 0, completedAt: "2026-01-01",
    results: [
      { cardId: "c1", correct: true, timeTaken: 1, confidence: 2 },
      { cardId: "c2", correct: false, timeTaken: 1, confidence: 2 },
      { cardId: "c3", correct: true, timeTaken: 1, confidence: 2 },
    ] }] as Session[];
  const stats = perVideoStats(cards, buildCardHistory(sessions));
  expect(stats.map((s) => s.videoId)).toEqual(["v1", "v2"]); // v1 50% before v2 100%
  expect(stats[0]).toMatchObject({ total: 2, correct: 1, accuracy: 50, title: "Intro" });
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run lib/analytics.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `perVideoStats`** in `lib/analytics.ts`:

```ts
import type { Card } from "@/types";

export function perVideoStats(cards: Card[], h: CardHistory) {
  const latest = latestPerCard(h);
  const byVideo = new Map<string, { title: string; total: number; correct: number }>();
  for (const c of cards) {
    const vid = c.source?.videoId;
    if (!vid) continue;
    const res = latest.get(c.id);
    if (!res) continue;
    const row = byVideo.get(vid) ?? { title: c.source!.title ?? vid, total: 0, correct: 0 };
    row.total += 1;
    if (res.correct) row.correct += 1;
    byVideo.set(vid, row);
  }
  return [...byVideo.entries()]
    .map(([videoId, r]) => ({ videoId, title: r.title, total: r.total, correct: r.correct,
      accuracy: r.total ? Math.round((r.correct / r.total) * 100) : 0 }))
    .sort((a, b) => a.accuracy - b.accuracy);
}
```

- [ ] **Step 4: Run to verify it passes** — Run: `npx vitest run lib/analytics.test.ts` — Expected: PASS.

- [ ] **Step 5: Render** a "By video" section in `AnalyticsView.tsx` (Recharts horizontal bar or a table like the tag table): title, accuracy bar, `correct/total`. Only render the section when `perVideoStats(...).length > 0`.

- [ ] **Step 6: Verify + commit**

Run: `npx tsc --noEmit` — exit 0.

```bash
git add lib/analytics.ts lib/analytics.test.ts app/analytics/AnalyticsView.tsx
git commit -m "feat(analytics): per-video 'learning by source' breakdown"
```

---

## PHASE IM — Import

### Task IM1: Broaden the paste formats the validator accepts

**Files:**
- Modify: `app/import/ImportView.tsx` (`validateCard`), `app/api/import/route.ts`
- Test: `app/api/import/route.test.ts` (extend)

**Interfaces:**
- Produces: `/import` + `POST /api/import` accept, in one paste, any mix of the five kinds AND tolerate: cloze cards given as `{ kind:"cloze", text }` (alias for `clozeText`), tf-sort given as `{ kind:"tf-sort", statements:[{statement,truth}] }` (aliases `statement→text`, `truth→isTrue`), match given as `{ pairs:[[a,b]] }` (tuple form). Unknown keys are ignored, never fatal.

- [ ] **Step 1: Write failing tests** in `app/api/import/route.test.ts` for each alias shape (assert the saved card normalizes to the canonical shape). Cover: cloze `text` alias; tf-sort `{statement,truth}`; match tuple `pairs:[["a","b"]]`.

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run app/api/import/route.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement alias normalization** in `app/api/import/route.ts` (before the existing per-kind branches) and mirror it in `ImportView.tsx`'s `validateCard` so the live preview matches the API. Keep the two in sync (Global Constraints).

```ts
// normalize aliases up front
if (item.kind === "cloze" && typeof (item as { text?: unknown }).text === "string" && !item.clozeText) {
  item.clozeText = (item as { text: string }).text;
}
if (item.kind === "tf-sort" && Array.isArray(item.statements)) {
  item.statements = item.statements.map((s) => {
    const o = s as { text?: unknown; statement?: unknown; isTrue?: unknown; truth?: unknown };
    return { text: o.text ?? o.statement, isTrue: o.isTrue ?? o.truth };
  });
}
if (item.kind === "match" && Array.isArray(item.pairs)) {
  item.pairs = item.pairs.map((p) => Array.isArray(p) ? { left: p[0], right: p[1] } : p);
}
```

- [ ] **Step 4: Run to verify it passes** — Run: `npx vitest run app/api/import/route.test.ts` — Expected: PASS.

- [ ] **Step 5: Add a schema/prompt menu entry** in `ImportView.tsx` (`SCHEMA_OPTIONS`) documenting the newer shapes so the preview pill + AI-prompt copy stay accurate.

- [ ] **Step 6: Commit**

```bash
git add app/import/ImportView.tsx app/api/import/route.ts app/api/import/route.test.ts
git commit -m "feat(import): accept alias paste formats for cloze/tf-sort/match"
```

---

### Task IM2: Dedupe + bulk-tag on import (pure core)

**Files:**
- Create: `lib/import-dedupe.ts`, `lib/import-dedupe.test.ts`

**Interfaces:**
- Produces:
  - `cardFingerprint(c: { kind?: string; question?: string; clozeText?: string }): string` — normalized (lowercased/trimmed) identity key.
  - `findDuplicates(incoming: T[], existing: { kind?: string; question?: string; clozeText?: string }[]): Set<number>` — indices in `incoming` that match an existing card by fingerprint.
  - `applyBulkTags<T extends { tags?: string[] }>(cards: T[], tags: string[]): T[]` — returns cards with `tags` union-merged (case-insensitive dedupe).

- [ ] **Step 1: Write failing tests**

```ts
// lib/import-dedupe.test.ts
import { expect, test } from "vitest";
import { cardFingerprint, findDuplicates, applyBulkTags } from "@/lib/import-dedupe";

test("fingerprint ignores case/whitespace", () => {
  expect(cardFingerprint({ kind: "mcq", question: " Big-O? " }))
    .toBe(cardFingerprint({ kind: "mcq", question: "big-o?" }));
});

test("findDuplicates flags matching indices", () => {
  const dup = findDuplicates(
    [{ kind: "mcq", question: "Big-O?" }, { kind: "flash", question: "New" }],
    [{ kind: "mcq", question: "big-o?" }],
  );
  expect([...dup]).toEqual([0]);
});

test("applyBulkTags union-merges case-insensitively", () => {
  const out = applyBulkTags([{ tags: ["algo"] }, { tags: [] }], ["Algo", "video"]);
  expect(out[0].tags.sort()).toEqual(["algo", "video"]);
  expect(out[1].tags.sort()).toEqual(["algo", "video"]);
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run lib/import-dedupe.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `lib/import-dedupe.ts`**

```ts
export function cardFingerprint(c: { kind?: string; question?: string; clozeText?: string }): string {
  const kind = (c.kind ?? "mcq").toLowerCase();
  const body = (c.clozeText ?? c.question ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return `${kind}::${body}`;
}

export function findDuplicates<T extends { kind?: string; question?: string; clozeText?: string }>(
  incoming: T[],
  existing: { kind?: string; question?: string; clozeText?: string }[],
): Set<number> {
  const seen = new Set(existing.map(cardFingerprint));
  const dup = new Set<number>();
  incoming.forEach((c, i) => { if (seen.has(cardFingerprint(c))) dup.add(i); });
  return dup;
}

export function applyBulkTags<T extends { tags?: string[] }>(cards: T[], tags: string[]): T[] {
  const add = tags.map((t) => t.trim()).filter(Boolean);
  return cards.map((c) => {
    const merged = new Map<string, string>();
    for (const t of [...(c.tags ?? []), ...add]) merged.set(t.toLowerCase(), t.toLowerCase());
    return { ...c, tags: [...merged.values()] };
  });
}
```

- [ ] **Step 4: Run to verify it passes** — Run: `npx vitest run lib/import-dedupe.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/import-dedupe.ts lib/import-dedupe.test.ts
git commit -m "feat(import): pure dedupe fingerprint + bulk-tag helpers"
```

---

### Task IM3: Wire dedupe + bulk-tag into the import preview

**Files:**
- Modify: `app/import/ImportView.tsx`
- Test: `components/__tests__/import-dedupe-ui.test.tsx` (or extend existing import test)

**Interfaces:**
- Behavior: on parse, `ImportView` fetches existing cards (`GET /api/cards`), computes `findDuplicates(incoming, existing)`, and marks duplicate rows with a "Duplicate" badge + a "skip duplicates" checkbox (default on) that excludes them from the POST. A "Bulk tags" input applies `applyBulkTags` to all previewed cards (mutating the JSON through the existing `mutateCards` path so the text stays the source of truth). Save posts the (optionally filtered, bulk-tagged) set.

- [ ] **Step 1: Write a component test** — render `ImportView`, seed a paste with one card that duplicates a mocked existing card, assert the "Duplicate" badge shows and the skip checkbox excludes it from the computed save payload. (Mock `api.get`/`api.post` from `@/lib/api`.)
- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run components/__tests__/import-dedupe-ui.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** the dedupe badge + skip checkbox + bulk-tags input in `ImportView.tsx`, routing tag changes through `mutateCards` and duplicate detection through `lib/import-dedupe`. Show a summary line ("N new, M duplicates").
- [ ] **Step 4: Run to verify it passes** — Run: `npx vitest run components/__tests__/import-dedupe-ui.test.tsx` — Expected: PASS.
- [ ] **Step 5: Verify + commit**

Run: `npx tsc --noEmit` (exit 0), `npm run lint` (0 problems).

```bash
git add app/import/ImportView.tsx components/__tests__/import-dedupe-ui.test.tsx
git commit -m "feat(import): dedupe badges + skip + bulk-tag in preview"
```

---

## PHASE V — Verify + document

### Task V1: Full verification + ai-memory

- [ ] **Step 1:** Run: `npx tsc --noEmit` (exit 0), `npm run lint` (0 problems), `npx vitest run` (all pass).
- [ ] **Step 2:** Update `docs/ai-memory/02-features-log.md` (analytics fixes + per-video metric + import improvements), `03-decisions.md` (lifted metrics into `lib/analytics.ts`; local-day forecast bucketing), `04-current-state.md` (new libs, verification counts). Update `CLAUDE.md` analytics section if the metric table changed (added "By video").
- [ ] **Step 3: Commit**

```bash
git add docs/ai-memory CLAUDE.md
git commit -m "docs: analytics fixes + import improvements"
```

---

## Self-Review

- **Spec coverage:** "numbers wrong" → AN1 (testable pure metrics) + AN2 (diagnosis) + AN3 (+ per-finding tasks) ✓; "charts broken/empty" → AN3 (forecast bucket + empty states + `-Infinity` guard) ✓; "add new metrics" → AN4 per-video ✓; import "support more formats" → IM1 alias shapes ✓; import "UX improvements (dedupe, bulk-tag, nicer preview)" → IM2 (pure) + IM3 (UI) ✓.
- **Placeholder scan:** AN2 is intentionally a diagnosis task with a concrete deliverable (findings doc) and spawns AN3-shaped fix tasks — not a placeholder, but its follow-ups are defined by reproduction. IM1/IM3 UI tests are described with concrete assertions; the alias test bodies in IM1 are specified by shape (implementer writes the three cases named). All code steps show code.
- **Type consistency:** `CardHistory`/`latestPerCard`/`cardTrend`/`tagTrend`/`perVideoStats` defined in AN1/AN4, consumed by `AnalyticsView` + `app/page.tsx`; `cardFingerprint`/`findDuplicates`/`applyBulkTags` defined IM2, consumed IM3. `Card.source` shared with Plan 1 Task A1 (noted dependency).
- **Ordering:** AN1 before AN2/AN3/AN4 (they build on the lib). IM2 before IM3. AN4 after Plan 1 A1 (or stub `Card.source`).
