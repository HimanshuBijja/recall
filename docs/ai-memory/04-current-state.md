# 04 — Current State

_Last updated: 2026-07-24_

## Branch
`master`. Everything below is merged and committed (local; **not yet pushed**).
Includes: MongoDB migration + Atlas→local mirror, the Flash/Cloze/Match/
Bookmarks/FSRS feature set (built by the Antigravity/Gemini agent), the
build/lint hardening pass, and the FSRS persistence fix + `/settings` page
(commit `ed5f25f`).

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

## Verification (all green as of this update)
- `npx tsc --noEmit` → clean.
- `npm test` → **48/48** (23 files, incl. jsdom component tests).
- `npm run lint` → **0 problems**.
- `npm run build` → compiles clean, all pages generated incl. `/settings` +
  `/api/settings`.

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
mirror target). `.env.local` git-ignored; `.env.local.example` tracked.

## Open items / TODO
- **Rotate the Atlas DB password** (exposed in a setup transcript).
- **Push `master`** to origin (currently local-only, several commits ahead).
- Set `MONGODB_URI`/`MONGODB_DB` in Vercel env before/at deploy.
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
