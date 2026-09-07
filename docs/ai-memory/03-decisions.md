# 03 — Decisions

Significant architectural/technical decisions. Newest first.

## 2026-09-07 — Notes Revision Feature (`/notes`)
- **Decision 1 — Direct Full-Width Image Presentation:** Unlike quiz/test views where screenshots are hidden behind a toggle, Notes Reader renders YouTube frames directly at full width without hidden frame toggles or card flipping mechanics.
- **Decision 2 — Chronological Timestamp Sorting:** Cards inside a Notebook are sorted by `source.timestamp` ascending so lecture slides reconstruct the video's chronological flow.
- **Decision 3 — LocalStorage Filter Persistence:** Card kind filters and view mode (`slide` vs `scroll`) are saved to `localStorage` under `recall_notes_kind_filters` and `recall_notes_view_mode`, automatically restoring user reading preferences across sessions.

Significant architectural/technical decisions. Newest first.

## 2026-09-07 — YouTube Deep-Link Timestamp Button (`▶ YouTube mm:ss`)
- **Decision:** Embed deep-linking YouTube timestamp buttons directly inside the `<CardFrame />` component, formatted as `▶ YouTube (mm:ss)`.
- **Why:** Allows learners to instantly jump to the exact video explanation/timestamp (`&t=Xs`) in a new browser tab without cluttering card layouts or requiring complex video iframe embeds inside test session views.
- **How:** Extended `<CardFrame />` props to accept `source?: CardSource`. When `isVideoSource(source)` is true, builds `https://www.youtube.com/watch?v={videoId}&t={Math.floor(timestamp)}s` with formatted timestamp text (`formatTimestamp`). Uses `e.stopPropagation()` so clicking the button doesn't trigger card flips or option selections.

## 2026-08-22 — Unified card edit layout & auto-resizing textareas
- **Decision 1 — Unified MCQ/Multi option editor:** Aligned the web app's `CardForm` layout for MCQ and Multi card types with the browser extension UI. The form now renders a single list of options with toggleable checkmarks instead of separate input lists for correct answers and distractors. This unifies option rendering and enables flexible numbers of distractors.
- **Decision 2 — Custom `AutoResizeTextarea` component:** Introduced a custom React forward-ref component that adjusts its `style.height` dynamically to its `scrollHeight + 4px` on input, value changes, and window resizing. This was applied to `question`, `clozeText`, `answer` (flashcard back), `hint`, `explanation`, and all MCQ/Multi options, resolving the issue where long text inside these fields was hidden behind scrollbars.
- **Decision 3 — Exclude option textareas from Enter-to-advance navigation:** While main textareas like question, hint, and explanation support pressing Enter to jump to the next field, options textareas are excluded to allow learners to input multi-line option text with simple Enter keys.
- **Decision 4 — Wide single-column layout:** Positioned all fields in a single, sequential column matching Anki/Recall's edit flow, but widened the layout to `max-w-4xl w-full` to utilize desktop screen width more effectively. This ensures fields span across the container without internal scrollbars (via the `AutoResizeTextarea` component) and provides a clean, unified view on all screen sizes.
- **Decision 5 — Submit Test Session Early:** Implemented a "Submit Early" button at the top right of the active test session status bar. It allows users to complete a session and save FSRS repetition calculations based solely on the subset of cards answered until that point.

## 2026-07-25 — Web text capture (any site)
- **`CardSource` is a discriminated union, and the web arm declares the video-only properties as `?: undefined`.** Eight call sites read `card.source?.videoId` directly; declaring `videoId?: undefined` on `WebSource` keeps all of them type-checking, so the union landed without touching analytics, groups, subjects, or exemptions. Use the `isVideoSource` / `isWebSource` guards from `lib/source.ts` anywhere you need to read `timestamp` or `screenshotUrl`.
- **The MCQ/multi "table" in the batch overlay is a CSS grid, not a `<table>`.** `ai.ts` inserts its diff block as a sibling of the field it replaces; inside a real `<tbody>` that would be a stray `<div>` between `<tr>`s. A grid row gives the same visual structure and leaves the existing pill insertion logic intact.

## 2026-07-25 — Modularized overlay.ts and fixed modular change preview (diffs) layout
- **Decision 1 — Modularize `overlay.ts`:** Extracted the massive string-based CSS stylesheet to a separate `styles.ts` file, and all Ask AI inline text selection & global card editors, as well as diff rendering preview logic, to `ai.ts`.
- **Decision 2 — Hide target row wrappers (`display: none`) to prevent squashing:** To solve the layout bug where vertical diff overlays (original pink strikethrough vs suggested green text) were invisible/squashed inside horizontal option rows, statement rows, or pair rows, we set `display: none` on the target's `.option-row` wrapper (or target itself for basic fields) and insert the diff overlay as a sibling of the hidden container. Upon accept or decline, `renderFields` is run, which creates brand new elements with default displays.

## 2026-07-24 — Capture extension lives in the Recall repo; Gemini drafts; R2 frames
- **Extension built inside Recall** (`extension/`), not the separate `clipper` project (clipper is reference only). The extension posts to Recall's own API so captured cards flow straight into the FSRS/test/analytics engine. Kept as an isolated pnpm workspace; root tsc/eslint/vitest exclude it.
- **Gemini (Vertex/`@google/genai`) drafts the full card** from a frame (not just OCR), per the user's choice. **Money guardrail: never call live Gemini/R2 without asking — the user smoke-tests manually.** All automated tests mock `lib/gemini` + `lib/storage`.
- **Two-step capture**: `POST /api/capture` returns an unsaved draft (OCR+draft+R2); the extension overlay lets the user edit; then `POST /api/cards` persists with `source`. Keeps drafting side-effect-light and review explicit.
- **Frames stored in Cloudflare R2** (`@aws-sdk/client-s3`); card stores only `source.screenshotUrl`. Revealed lazily in the app (image fetched only on button press) in Test/Result/Cards.
- **`Card.source` is the single provenance field** (video + timestamp + marker). Markers on the YouTube timeline are derived from `GET /api/cards?videoId=`. The `MarkerShape` enum + per-kind shape/color map must stay byte-identical between Recall and the extension (no shared build root — the plan's constraint table is the source of truth).
- **Parallel subagent execution**: 4 worktree-isolated agents on disjoint file sets, merged with `--no-ff`. Exposed that in-repo worktrees under `.claude/` pollute root tsc/eslint/vitest — fixed by excluding `.claude/` and `extension/`.
- **Analytics metrics lifted into `lib/analytics.ts`** (pure, unit-tested) instead of inlined in the view, so the invariant (latest-per-card) is testable and shared with the dashboard. Forecast now buckets by **local** calendar day, not UTC.

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

