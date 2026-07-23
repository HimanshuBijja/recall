# 04 — Current State

_Last updated: 2026-07-23_

## Branch
`master`. Everything below is merged and committed (local; **not yet pushed**).
Includes: MongoDB migration + Atlas→local mirror, the Flash/Cloze/Match/
Bookmarks/FSRS feature set (built by the Antigravity/Gemini agent), and the
build/lint hardening pass.

## Storage
- **Atlas** = source of truth (`MONGODB_URI`), replica set (transactions +
  change streams available).
- **Local mongod** = live one-way mirror of Atlas (standalone, `127.0.0.1:27017`).
- `data/*.json` retained as a backup snapshot.

## Feature surface
- Card kinds: **mcq, tf-sort, flash, cloze (`==answer==`), match**.
- **Bookmarks**: `bookmarked` flag, star toggles, `/bookmarks` page + nav,
  PATCH toggle on `/api/cards/[id]`.
- **FSRS scheduler** (`ts-fsrs`): reviews updated on session save, `due=1`
  review mode with batch continue, `/api/reviews/due` + `/summary`, dashboard
  "Review due" card, analytics retention + 14-day forecast.

## Verification (all green as of this update)
- `npx tsc --noEmit` → clean.
- `npm test` → **37/37** (21 files, incl. jsdom component tests).
- `npm run build` → compiles + generates all 15 pages.
- `npm run lint` → **0 problems**.

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
- Consider a review of the Gemini implementation against the agreed spec
  (`docs/superpowers/plans/2026-07-23-all-features.md`) — logic depth of
  cloze/match/FSRS beyond "tests pass" not yet independently audited.
- Whole-collection replace on every write is O(n); move hot paths to
  per-document ops later.

## Next suggested step
Push `master`, then deploy to Vercel (with Atlas env vars set) and smoke-test a
live due-review session.
