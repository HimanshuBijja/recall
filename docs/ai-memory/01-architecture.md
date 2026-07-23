# 01 — Architecture

## Layers
- **UI** — Next.js App Router pages + client components (`app/`, `components/`).
  Server Components fetch data directly via the data layer; interactive views
  are client components using Axios (`lib/api.ts`).
- **API** — Route Handlers in `app/api/**/route.ts` (GET/POST/PUT/DELETE).
  Dynamic params are `Promise<{...}>` and must be awaited (Next 16).
- **Data layer** — `lib/db.ts` exposes async `readDb<T>(name)` /
  `writeDb<T>(name, data)`. Each logical "file" name (e.g. `cards.json`) maps to
  a Mongo collection (`.json` stripped).
- **Connection** — `lib/mongodb.ts` holds a single global-cached `MongoClient`
  (`getDb`, `getClient`, `supportsTransactions`, `resetDbForTests`), reading
  `MONGODB_URI` + `MONGODB_DB`.

## Data-layer semantics
- `readDb` returns all docs in a collection with `_id` projected out (the
  app-level `id` field is the identity; `_id` never leaks to responses/types).
- `writeDb` replaces the whole collection. On a replica-set/Atlas it uses a
  transaction; on a standalone mongod it swaps in a fully-written temp
  collection via `renameCollection(dropTarget)` (atomic, no data-loss window).
- Whole-collection replace is behaviour-preserving vs the old JSON layer.
  Per-document collections are a planned optimization (e.g. an SRS `reviews`
  collection).

## Atlas -> local mirror
- App = source-of-truth reads/writes against Atlas.
- `scripts/mirror-lib.mjs` — shared connect + collection list + copy helper.
- `scripts/mirror-pull.mjs` (`npm run sync:local`) — one-shot full copy
  Atlas -> local.
- `scripts/mirror-watch.mjs` (`npm run mirror:watch`) — DB-level change stream
  on Atlas applied to local (insert/update/replace/delete/drop).
- `scripts/dev-synced.mjs` (`npm run dev:synced`) — pull once, then run the
  watcher + `next dev` together.
- One-way only: local writes are not synced up and get overwritten.

## Tags as a DAG
`lib/tags.ts`: `flattenDag()` (render tree, marks shared nodes, breaks cycles),
`descendantTagIds()` (downward reachable set, used to expand a tag selection
into all its children during test setup).

## Analytics invariant
Accuracy metrics use the **latest attempt per card** (not lifetime averages),
so retrying a missed card and getting it right raises every accuracy number.
`SessionResult.correct` is a single boolean across all card kinds.

## Deployment
Vercel. Runtime FS is read-only, but data is in MongoDB, so writes work.
`MONGODB_URI`/`MONGODB_DB` set in Vercel env; Atlas network access allow-lists
Vercel egress.
