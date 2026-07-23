# 02 — Features Log

Newest first.

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
