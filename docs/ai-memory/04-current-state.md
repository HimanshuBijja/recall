# 04 — Current State

_Last updated: 2026-07-24_

## Branch
`master`. Everything below is merged and committed (local; **not yet pushed**).
Includes: MongoDB migration + Atlas→local mirror, the Flash/Cloze/Match/
Bookmarks/FSRS feature set (built by the Antigravity/Gemini agent), the
build/lint hardening pass, the FSRS persistence fix + `/settings` page
(commit `ed5f25f`), and the **YouTube capture extension + capture backend +
analytics/import upgrades** (commit `f889715`, built by 4 parallel subagents).

## Storage
- **Atlas** = source of truth (`MONGODB_URI`), replica set (transactions +
  change streams available).
- **Local mongod** = live one-way mirror of Atlas (standalone, `127.0.0.1:27017`).
- `data/*.json` retained as a backup snapshot.
- Collections: `cards`, `tags`, `groups`, `sessions`, `bin`, `reviews`, and
  `settings` (single-doc FSRS config, defaults if absent).

## Feature surface
- Card kinds: **mcq, tf-sort, flash, cloze (`==answer==`), match**.
- **Bookmarks**: `bookmarked` flag, star toggles, `/bookmarks` page + nav,
  PATCH toggle on `/api/cards/[id]`.
- **FSRS scheduler** (`ts-fsrs`): reviews updated on session save, `due=1`
  review mode with batch continue, `/api/reviews/due` + `/summary`, dashboard
  "Review due" card, analytics retention + 14-day forecast. **Now configurable**
  via `/settings` (see below). Persistence bug fixed — `learning_steps`/`lapses`
  now round-trip, so Good/Hard answers graduate instead of looping (was broken).
- **Settings** (`/settings`): edit practical FSRS params (retention, max
  interval, learning/relearning steps, fuzz, short-term) in a new `settings`
  collection; `GET`/`PUT /api/settings`. Live interval visualizer (Recharts)
  projects intervals for a rating path + shows first-review branches, recomputed
  from unsaved form values. Scheduler reads settings on session save
  (going-forward only). `lib/settings.ts`, `lib/fsrs-preview.ts`.
- **YouTube capture** (`extension/` MV3 + capture backend): per-kind hotkey
  captures a video frame → `POST /api/capture` (Gemini drafts a full card + R2
  stores the frame) → in-page overlay to review/edit → `POST /api/cards` with
  `Card.source`. Per-kind timeline markers + show/hide filter; full-page options.
  `Card.source` provenance; lazy "Show frame" in Test/Result/Cards. **Extension
  not yet smoke-tested against live Gemini/R2 — user's manual step.**
- **Analytics**: pure metrics in `lib/analytics.ts`; forecast now local-day
  bucketed; new **"By video"** per-source accuracy section.
- **Import**: alias paste formats (cloze/tf-sort/match), dedupe badges +
  skip-duplicates + bulk-tag in the preview.

## Verification (all green as of this update)
- Recall `npx tsc --noEmit` → clean; `npm run lint` → 0 errors (3 pre-existing
  warnings); `npx vitest run` → **77 pass** (33 files).
- Extension `pnpm --dir extension exec tsc --noEmit` → clean; `vitest` → **20
  pass**; `pnpm --dir extension build` → OK.
- Root `tsc`/`eslint`/`vitest` exclude `extension/` + `.claude/` (agent worktrees).
- `npm run build` not re-run this pass.

> **Gotcha (fixed):** client components must import FSRS *pure* helpers from
> `lib/fsrs-config.ts`, NOT `lib/settings.ts`. `lib/settings.ts` imports
> `lib/db` → `mongodb`, so importing it into a client bundle triggers
> `Module not found: child_process`. Keep DB-touching code out of anything a
> `"use client"` file imports.

## How to run locally
```bash
npm install
# .env.local must define MONGODB_URI (Atlas), MONGODB_DB, LOCAL_MONGODB_URI
npm run dev:synced   # pull Atlas->local, live mirror, + next dev
```

## Env vars
`MONGODB_URI` (Atlas), `MONGODB_DB` (=recall), `LOCAL_MONGODB_URI` (local
mirror target). Capture backend adds: `GEMINI_API_KEY` + `GEMINI_OCR_MODEL`
(or Vertex ADC: `GOOGLE_CLOUD_PROJECT`/`GOOGLE_CLOUD_LOCATION`), and R2:
`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`/
`R2_PUBLIC_BASE_URL`. `.env.local` git-ignored; `.env.local.example` tracked.

## Open items / TODO
- **Rotate the Atlas DB password** (exposed in a setup transcript).
- **Push `master`** to origin (currently local-only, many commits ahead).
- Set `MONGODB_URI`/`MONGODB_DB` in Vercel env before/at deploy. Capture
  backend on Vercel would also need `GEMINI_*` + `R2_*` env (costs money).
- **Smoke-test the capture extension** end-to-end against a running Recall +
  live Gemini + R2 (build: `pnpm --dir extension build`, load `extension/dist`
  unpacked). Not done by agents (money guardrail).
- Keep the `MarkerShape` enum + per-kind shape/color map in sync between
  Recall (`types/index.ts`, `/api/capture`) and the extension (no shared build).
- **FSRS scheduling audited** (2026-07-24): found + fixed the critical
  learning_steps/lapses persistence bug. **Cloze/match** logic depth vs the
  agreed spec (`docs/superpowers/plans/2026-07-23-all-features.md`) still not
  independently audited.
- FSRS uses **default model weights** (`w[]`); they aren't exposed in `/settings`
  and there's no optimizer fitting them from the `reviews` history yet.
- Whole-collection replace on every write is O(n); move hot paths to
  per-document ops later.

## Next suggested step
Push `master`, then deploy to Vercel (with Atlas env vars set) and smoke-test a
live due-review session.
