# 04 — Current State

_Last updated: 2026-07-23_

## Branch
`feat/mongodb-atlas-storage` — MongoDB migration + Atlas→local mirror.
Complete, reviewed, tests green. Not yet merged to `master`.

## Storage
- **Atlas** = source of truth (`MONGODB_URI`), replica set (transactions +
  change streams available). Seeded: tags 1, sessions 75, groups 3, bin 492,
  cards 0.
- **Local mongod** = live one-way mirror of Atlas (standalone, on
  `127.0.0.1:27017`).
- `data/*.json` retained as a backup snapshot.

## What works
- Full app CRUD against Atlas (verified via API smoke test).
- `npm test` → 5/5. `npx tsc --noEmit` → clean.
- Mirror verified end-to-end: insert/update/delete on Atlas propagate to local
  in ~2s. `sync:local` and `mirror:watch` and `dev:synced` all functional.

## How to run locally
```bash
npm install
# .env.local must define MONGODB_URI (Atlas), MONGODB_DB, LOCAL_MONGODB_URI
npm run dev:synced   # pull Atlas->local, live mirror, + next dev
```

## Env vars
`MONGODB_URI` (Atlas), `MONGODB_DB` (=recall), `LOCAL_MONGODB_URI` (local
mirror target). `.env.local` is git-ignored; `.env.local.example` is tracked.

## Open items / TODO
- **Rotate the Atlas DB password** (exposed in a setup transcript).
- Merge or PR the branch (integration decision pending).
- Set `MONGODB_URI`/`MONGODB_DB` in Vercel env before/at deploy.
- Roadmap features not started: cloze / match / flashcard card kinds, quick-test
  from card browser, bookmark/flag, SRS scheduler, PWA/offline. See
  `docs/superpowers/plans/2026-07-23-recall-upgrades-roadmap.md`.

## Next suggested step
Merge the branch, then start the roadmap (suggested first: quick-test from card
browser → flashcards).
