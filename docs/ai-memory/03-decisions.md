# 03 — Decisions

Significant architectural/technical decisions. Newest first.

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
