# 02 — Features Log

Newest first.

## 2026-07-25 — Modularized Extension Overlay & Fixed AI Changes Diff Bug
- **Modularized Overlay Codebase**: Extracted CSS styles into `styles.ts` and AI selection / global editor logic into `ai.ts`, reducing the lines of code in `overlay.ts` significantly (from ~1100 to ~150 lines).
- **Fixed AI Changes Rendering Bug**: Resolved the layout issue where diff overlay blocks did not render or appeared squashed inside option, statement, and pair rows. Applied `display: none` on targets / `.option-row` wrappers to hide them from the document flow completely while modular changes are previewed, allowing the vertical diff container to render at full width.

## 2026-07-24 — Extension UI Revamp, MCQ/Multi Separation, Single-Tag Prompt, Autocomplete Tag Selector, and Inline Ask AI Editor
- **Segregation of MCQ & Multi:** Kept MCQ and Multi as distinct card types with separate hotkeys and static badges (avoiding conversion data-loss). MCQ uses radio-button correct checkmarks; Multi uses multi-checkbox checkmarks.
- **Dark Obsidian UI Theme:** Revamped the entire extension UI styling to feature a high-end dark obsidian developer aesthetic (deep charcoal backgrounds `#121214`/`#18181b`, dark zinc borders `#2e2e33`, and premium pure white `#ffffff` primary action highlights and focus indicator lines, replacing all legacy blue colors). SVG strokes and paths inside global AI sparkle buttons target both tags, but apply width/height properties solely on the outer `<svg>` wrapper to ensure the icon is fully visible and doesn't collapse.
- **Inline Comparison Diff Overlays:** Replaced separate popover tooltip blocks with clean inline comparison blocks that flow directly inside the form layout, temporarily hiding the raw text fields. Displays original text (red, strikethrough) and suggested text (green) stacked vertically under each other. Uses a defensive `insertBefore` or fallback `appendChild` DOM insertion. At the top-right of the diff block, a modern dark pill `[ ✓ ] [ ✗ ]` offers direct keep/revert operations without any cluttered text labels or outer bodies. Added diagnostic log traces to aid draft value comparisons.
- **Single-Tag Concept Generation:** Updated `lib/gemini.ts` prompts to instruct Gemini to extract a single tag based on the concept/topic taught in the video title (parsing defensively limits output to 1 tag).
- **Tag Selector Autocomplete UI:** Created a custom Chip TagSelector in `fields.ts` that fetches all tags via `GET_TAGS` message. Auto-suggests existing matching tags, allows creating a new tag inline with enter/click, and displays them as chips with remove buttons.
- **Inline Ask AI Text Editor:** Implemented an interactive Google Colab-style floating edit system. Selecting text in any input/textarea overlay field reveals a floating "Ask AI" button. Clicking it displays an extremely minimal input box (textarea that auto-grows up to 3 lines) with a circular up-arrow send button. Shows minimal circular accept (✓) / decline (✗) buttons to replace the selected text range.
- **Global Ask AI Card Editor:** Added a sparkle SVG button in the top-right actions header. Clicking it opens a modern pill-like card prompt container matching the inline selection style (single-row rounded wrapper, auto-growing textarea up to 3 lines, and circular send button). Offers global Decline All / Accept All controls.

## 2026-07-24 — YouTube capture extension + capture backend, analytics fixes, import upgrades
Branch: `master` (built by 4 parallel worktree subagents, reviewed + merged).

**Capture backend (Recall):**
- `Card.source?: CardSource` ({videoId, url, timestamp, channel?, title?, screenshotUrl?, marker?{shape,color}}); `MarkerShape` enum. `types/capture.ts` (CardDraft/CaptureRequest/CaptureResponse).
- `lib/storage.ts` — Cloudflare R2 frame upload (`@aws-sdk/client-s3`). `lib/gemini.ts` — `draftCardFromFrame` (Gemini 2.5 Flash-Lite via `@google/genai`) drafts a full card of any kind from a frame; `parseDraft` defensive.
- `POST /api/capture` — OCR + draft + R2 upload, returns an UNSAVED draft (no persist). `GET /api/cards?videoId=` — marker rows. `validate.ts` threads `source`. `lib/export.ts` round-trips `source`.
- `components/CardFrame.tsx` — lazy "Show frame" reveal (image requested only on click), mounted in TestSession, ResultView, CardsBrowser.
- New env: `GEMINI_API_KEY`/`GEMINI_OCR_MODEL` (or Vertex ADC), `R2_*`. New deps: `@google/genai`, `@aws-sdk/client-s3`.

**Chrome extension (`extension/`, MV3, Vite+TS, pnpm workspace):**
- Per-kind hotkeys (default Alt+Shift+Q/F/C/T/M, all user-configurable), capture frame → `/api/capture` → in-page shadow-DOM overlay to review/edit the AI draft (per-kind editors, editable AI-suggested tags, Undo, AI-rephrase) → save to `/api/cards`. Offline queue.
- Per-kind timeline markers (circle/square/triangle/diamond/star, colored) with show/hide-by-kind filter. Options page opens **full-page in a new tab** (`options_ui.open_in_tab` + `openOptionsPage()`); popup toggles marker visibility. Base URL configurable (default localhost:3000, Atlas-backed).
- **Not smoke-tested**: no live Gemini/R2/YouTube capture was run by agents (money guardrail) — that's the user's manual test.

**Analytics fixes (Plan 2):**
- Lifted pure metrics into `lib/analytics.ts` (buildCardHistory, latestPerCard, overallAccuracy, cardTrend, tagTrend, perVideoStats) with tests; AnalyticsView + dashboard weak-tags consume them (deduped).
- Fixed forecast day-bucketing to **local calendar days** (`lib/due.ts`) — a due-later-today review was vanishing from the chart; added empty-state guards on difficulty/confidence charts. Findings in `docs/superpowers/notes/2026-07-24-analytics-findings.md`.
- New **"By video"** analytics section (per-source accuracy, weakest first) via `perVideoStats`.

**Import upgrades (Plan 2):**
- Accept alias paste formats: cloze `{text}`, tf-sort `{statement,truth}`, match tuple `pairs:[["a","b"]]` — normalized in both `ImportView.validateCard` and `app/api/import/route.ts`. New schema menu entry.
- `lib/import-dedupe.ts` (cardFingerprint/findDuplicates/applyBulkTags); ImportView shows Duplicate badges + skip-duplicates checkbox + bulk-tags input + "N new, M duplicates" summary.

**Integration/config:** root `vitest.config.ts`, `tsconfig.json`, `eslint.config.mjs` now exclude `extension/` (separate workspace) and `.claude/` (in-repo agent worktrees) so the root toolchain doesn't scan them.

**Verification:** Recall `tsc` clean, lint 0 errors (3 pre-existing warnings), `vitest` 77 pass. Extension `tsc` clean, `vitest` 20 pass, build OK.

## 2026-07-23 — FSRS scheduling fix + Settings page with interval visualizer
Branch: `master`.

**Critical bug fixed:** `lib/srs.ts` `serialize`/`deserialize` dropped two
fields the ts-fsrs 5.4 `Card` needs — `learning_steps` and `lapses`. Since every
review round-trips through Mongo, `learning_steps` reset to 0 each review, so a
card answered **Good** (confidence 2) or **Hard** (confidence 1) never left the
learning steps — it was pinned in a sub-10-minute loop instead of graduating to
day/week/month intervals. Only **Easy** (confidence 3) escaped, which is why the
old tests (all confidence 3) missed it. Added both fields to `FsrsState`,
`serialize`, `deserialize`. Old stored reviews self-heal on next review
(deserialize defaults missing fields to 0).

**Also fixed:** `lib/due.ts` forecast helper was misnamed `getLocalDateString`
but returns a UTC date — renamed `getUtcDateString` (bucketing stays UTC).

**New feature — `/settings`:**
- Configurable practical FSRS params stored in a new `settings` collection:
  `request_retention` (0.70–0.97), `maximum_interval`, `learning_steps`,
  `relearning_steps`, `enable_fuzz`, `enable_short_term`. Raw 19 weights are
  intentionally not exposed.
- `lib/settings.ts` — `DEFAULT_FSRS_SETTINGS`, `readSettings` (merge over
  defaults), `writeSettings`, `validateSettings`, `parseSteps`/`formatSteps`,
  `toGeneratorParameters`.
- `GET`/`PUT /api/settings` (validated, 400 on bad input).
- Scheduler now reads settings: `updateReviewsForResults` builds one FSRS
  instance from saved settings and passes it to `applyReview` (which gained an
  optional `scheduler` arg, defaulting to default params for back-compat).
  **Going-forward only** — saving does not recompute existing due dates.
- `lib/fsrs-preview.ts` — pure `projectPath()` (interval sequence for a rating
  path) + `branchFromNew()` (four-rating next-step), reused client-side.
- `app/settings/SettingsView.tsx` — form + **live visualizer** (Recharts line
  chart + tables) recomputed from *unsaved* form values via `useMemo`. Presets:
  All Good / All Easy / All Hard / Good-with-a-lapse. Nav gains a Settings item
  (mobile grid `grid-cols-9` → `grid-cols-10`).

**Files added:** `lib/settings.ts`, `lib/fsrs-preview.ts`,
`app/api/settings/route.ts`, `app/settings/page.tsx`,
`app/settings/SettingsView.tsx`, `lib/settings.test.ts`,
`lib/fsrs-preview.test.ts`.
**Files modified:** `types/index.ts`, `lib/srs.ts`, `lib/reviews.ts`,
`lib/due.ts`, `components/Nav.tsx`, `lib/srs.test.ts` (+ fixtures in
`lib/due.test.ts`, `app/api/reviews/due/route.test.ts`,
`components/__tests__/analytics.test.tsx`).
**Verification:** `tsc` clean, lint 0 problems, **48/48** tests (was 37).

## 2026-07-23 — Build/lint hardening after multi-agent feature merge
Branch: `master`.

**What:** The Flash/Cloze/Match/Bookmarks/FSRS features (below) were implemented
by a second agent (Antigravity/Gemini). Its walkthrough claimed "all verified,"
but it ran only the vitest suite, not a typecheck — so build-breaking type
errors had shipped. This pass made the tree genuinely green.

**Fixed**
- `app/import/ImportView.tsx` — `RawCard` was missing `clozeText` / `pairs`
  (10 `tsc` errors in the cloze/match import preview). Added the fields.
- `lib/srs.ts` — `ratingFrom` now returns `Grade` (not `Rating`) so
  `ts-fsrs` `next()` typechecks.
- `eslint.config.mjs` + `.gitignore` — ignore `.gemini/` (Antigravity IDE
  tooling dumped into the repo; ~40 lint problems, not app code).
- Removed dead imports/vars (`TfStatement`, `readDb`, `waitFor`, `tagById`,
  `_req`, `clozeFocus`); `summary` GET no longer takes an unused `req`.
- Documented `eslint-disable` on 8 pre-existing, known-safe react-hooks
  patterns (theme sync, sessionStorage load, per-card reset, `Date.now()`
  display math, ref-advance helper, due-batch load) — behaviour unchanged.

**Verification (all green):** `npx tsc --noEmit` clean; `npm test` 37/37;
`npm run build` compiles + generates all 15 pages; `npm run lint` 0 problems.

**Note:** the walkthrough's prose said cloze uses `{{c1::answer}}`, but the
actual code correctly uses `==answer==` (the agreed syntax) — code right,
write-up wrong.

## 2026-07-23 — Flashcard, Cloze, Match kinds, Bookmarks, and FSRS scheduler
Branch: `master` (current upgrades).

**What:** Integrated new card kinds (Flashcards, Cloze, Match), bookmarking system, and FSRS-based spaced-repetition scheduler with due sessions, batching, dashboard alerts, and analytics forest charts.

**Added**
- `lib/cloze.ts` — pure parser and grader for cloze-deletions.
- `lib/srs.ts` — FSRS parameter tuning and state advancement.
- `lib/due.ts` — reviews due-status forecasting and summary calculator.
- `app/api/reviews/due/route.ts` — endpoint for due flashcards.
- `app/bookmarks/page.tsx`, `BookmarksView.tsx` — bookmarks browsing, filtering, and testing page.
- `components/__tests__/session-due.test.tsx`, `session-match.test.tsx`, `session-cloze.test.tsx`, `bookmarks-toggle.test.tsx`, `bookmarks-page.test.tsx`, `analytics.test.tsx` — full component tests suite.

**Modified**
- `types/index.ts` — added `cloze` and `match` kind types, `FsrsState`, `Review`, and bookmark fields.
- `components/CardForm.tsx` — added Cloze edit area ("Cloze it") and Match pairs creator.
- `app/test/session/TestSession.tsx` — added Cloze inputs/grading, Match interactive column pairing, and FSRS due-mode batch continue.
- `app/cards/CardsBrowser.tsx` — added bookmark filter toggles and star bookmarking UI.
- `app/page.tsx` — added Spaced Repetition Review action card.
- `app/analytics/AnalyticsView.tsx` — added SRS retention metric and 14-day reviews forecast bar chart.
- `app/api/cards/[id]/route.ts` — added PATCH endpoint to toggle bookmark state.
- `app/api/sessions/route.ts` — updates FSRS review cards upon completing review tests.

## 2026-07-23 — MongoDB migration + Atlas→local mirror
Branch: `feat/mongodb-atlas-storage`.

**What:** Replaced the flat-JSON data store with MongoDB, and added a one-way
Atlas→local mirror.

**Added**
- `lib/mongodb.ts` — cached `MongoClient` singleton (`getDb`, `getClient`,
  `supportsTransactions`, `resetDbForTests`).
- `lib/db.test.ts`, `lib/db.standalone.test.ts` — data-layer tests (replica-set
  + standalone), via `mongodb-memory-server`. 5 tests.
- `scripts/seed-mongo.mjs` — seed DB from `data/*.json`.
- `scripts/mirror-lib.mjs`, `mirror-pull.mjs`, `mirror-watch.mjs`,
  `dev-synced.mjs` — Atlas→local mirror.
- `vitest.config.ts`.
- Plans: `docs/superpowers/plans/2026-07-23-mongodb-migration.md`,
  `2026-07-23-recall-upgrades-roadmap.md`.

**Modified**
- `lib/db.ts` — `readDb`/`writeDb` now async + Mongo-backed (`_id` projected
  out; transactional write on Atlas, atomic temp-rename on standalone).
- All `app/api/**/route.ts` and data-reading Server Component pages — added
  `await` at every `readDb`/`writeDb` call; several pages made `async`.
- `package.json` — scripts (`test`, `test:watch`, `seed:mongo`, `sync:local`,
  `mirror:watch`, `dev:synced`) + deps.
- `.env.local.example`, `.gitignore` (track the example), `CLAUDE.md`,
  `README.md`.

**Routes / endpoints:** unchanged (behaviour-preserving).

**DB changes:** collections `cards`, `tags`, `sessions`, `groups`, `bin`
(mirror of the former JSON files). App `id` kept distinct from Mongo `_id`.

**Env vars added:** `MONGODB_URI`, `MONGODB_DB`, `LOCAL_MONGODB_URI`.

**Packages added:** `mongodb`; dev: `vitest`, `mongodb-memory-server`.

**Breaking changes:** the data layer is now async — every caller must `await`
`readDb`/`writeDb`. The app requires `MONGODB_URI` (and a reachable DB) to run.

**Verification:** 5/5 tests pass; `npx tsc --noEmit` clean; live end-to-end
mirror verified (insert/update/delete on Atlas reach local in ~2s).

**Known issues / TODOs**
- Rotate the Atlas DB password (it was shared in a chat transcript during setup).
- Whole-collection replace on every write is O(n); move hot paths (session
  insert, single-card CRUD) to per-document ops later.
- Mirror is one-way; offline writes to local are not synced up.
- `data/*.json` kept as a backup snapshot (not removed).

## Earlier (pre-migration, from git history)
Card CRUD, tag DAG manager, groups, unified bin, test flow (MCQ + tf-sort),
analytics, JSON import/export, filters, quick-launch groups.
