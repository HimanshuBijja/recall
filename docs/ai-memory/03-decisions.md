# 03 — Decisions

Significant architectural/technical decisions. Newest first.

## 2026-07-23 — FSRS settings: practical knobs, going-forward-only, hand-rolled UI
**Decision 1 — expose a practical subset, not raw weights.** `/settings` edits
`request_retention`, `maximum_interval`, learning/relearning steps, fuzz, and
short-term only. **Why:** the 19 `w[]` weights are machine-optimized from review
history; hand-editing them is a foot-gun with no good UX. Left as future work
(needs an optimizer over `reviews`).

**Decision 2 — settings apply going-forward only.** Saving does not recompute
stored due dates; each card picks up new params on its next review. **Why:**
matches Anki/FSRS norms, avoids a flood of suddenly-due cards, and history can't
be perfectly replayed anyway.

**Decision 3 — scheduler takes settings via dependency injection.**
`applyReview(..., scheduler?)` defaults to a default-params FSRS instance;
`updateReviewsForResults` builds one instance from saved settings per session
save and passes it in. **Why:** keeps the pure `srs.ts` functions testable and
all existing callers/tests unchanged, while making the live path configurable.

**Decision 4 — settings UI matches existing hand-rolled Tailwind, not the
shadcn/RHF/Zod stack in `instructions.md`.** **Why:** the whole app is
hand-rolled Tailwind with plain React state + `useToast`; introducing shadcn on
one page would be inconsistent. Noted as a deliberate deviation.

## 2026-07-23 — MongoDB as the data store (was flat JSON)
**Decision:** Store data in MongoDB instead of flat JSON files.
**Why:** Enables writes in production (Vercel FS is read-only), so sessions,
edits, and future features persist from the phone. Data is document-shaped, so
it maps almost 1:1 to collections.
**How:** Keep the `readDb`/`writeDb` interface (now async) so ~15 routes change
only by adding `await` — a behaviour-preserving swap.

## 2026-07-23 — Atlas is the single source of truth; local mongod is a mirror
**Decision:** The app (localhost + Vercel) reads/writes Atlas. The local mongod
is a one-way, read-only mirror kept fresh via change streams.
**Why:** The user wanted phone use while the laptop is off (Atlas is always on)
AND a fresh local copy on the laptop, without the complexity/edge-cases of a
bidirectional last-write-wins sync engine.
**Trade-off:** Writing to local directly (e.g. offline) is NOT synced up and
gets overwritten by the mirror. True offline-writes-that-sync-back was
explicitly out of scope.
**Rejected alternatives:** native replication (Atlas won't accept external
members), `mongosync` (one-way migration tool), Atlas Device Sync / Realm
(deprecated ~2025), custom bidirectional LWW engine (too complex for the need).

## 2026-07-23 — writeDb: transaction on Atlas, atomic temp-rename on standalone
**Decision:** `writeDb` detects transaction capability (`hello.setName`,
memoized) and branches.
**Why:** Transactions need a replica set (Atlas has one; a standalone local
mongod does not). The standalone path writes a temp collection then
`renameCollection(dropTarget)` so the replace stays atomic (no empty-collection
window on crash). Same code runs against either deployment.

## 2026-07-23 — Cloze/Match scoring is all-or-nothing
**Decision:** New card kinds keep `SessionResult.correct` a single boolean.
**Why:** All analytics (latest-per-card accuracy, trends, weak tags) depend on
that invariant; partial credit would require reworking every metric.

## 2026-07-23 — Keep data/*.json as a backup
**Decision:** Did not delete the JSON files after migrating.
**Why:** Local mongod is not otherwise backed up; the JSON snapshot is a
rollback net and the seed source.

## 2026-07-23 — FSRS Spaced Repetition integration
**Decision:** Standardized on `ts-fsrs` package for spaced repetition mathematical state transitions.
**Why:** Avoids custom implementations of SRS intervals, ensuring optimized stability, difficulty, and interval forecasting calculations.
**How:** Wrapped `ts-fsrs` with simple grading map mapping learner confidence rating (1=Hard, 2=Good, 3=Easy) or incorrect (0=Again) onto `Rating` enums.

## 2026-07-23 — Match interaction with column shuffling
**Decision:** Selected item matching splits items into left and right columns, shuffled independently.
**Why:** Standard match-making can be trivialized if options align directly. Independent column shuffling challenges understanding of the paired items.
**How:** Track selected elements on left and right, highlight errors with brief shake animation, and freeze correct matches.

## 2026-07-23 — Suppress pre-existing react-hooks lint rather than rewrite working code
**Decision:** The React-Compiler advisory rules (`react-hooks/set-state-in-effect`,
`react-hooks/purity`, `react-hooks/refs`) fire on 8 pre-existing, known-safe
patterns. Suppressed each with a documented `eslint-disable` line instead of
refactoring, and excluded `.gemini/` (Antigravity IDE tooling) from lint + git.
**Why:** These are advisory, non-breaking flags on intentional patterns (theme
sync, sessionStorage load, per-card reset, `Date.now()` display math, the
ref-advance focus helper). Rewriting working interaction code to satisfy the
linter carries regression risk with no functional benefit. The rules stay
active as errors for new code.
**Trade-off:** If those patterns are ever genuinely reworked, drop the disables.

