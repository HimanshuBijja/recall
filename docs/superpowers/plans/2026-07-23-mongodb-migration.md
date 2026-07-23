# MongoDB Atlas Migration (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the JSON-file data layer with MongoDB Atlas, so data persists in the cloud and is writable in production (including from mobile).

**Architecture:** A single cached MongoDB connection lives in `lib/mongodb.ts` (the standard Next.js/serverless global-cache pattern, so hot reloads and serverless invocations don't exhaust connections). A thin async compatibility layer in `lib/db.ts` keeps the existing `readDb`/`writeDb` *shape* — but **async** — where each former JSON file (`cards.json` → collection `cards`, etc.) maps to a Mongo collection. `readDb` returns all docs (with `_id` projected out); `writeDb` replaces the whole collection inside a transaction. This is a **behaviour-preserving** swap: every route keeps its read→mutate→write logic and only gains `await`. Per-document repositories (idiomatic Mongo) are introduced later, per-feature, where hot paths need them.

**Tech Stack:** Next.js 16 (App Router), `mongodb` official Node driver, MongoDB Atlas (free M0 tier), Vitest + `mongodb-memory-server` for tests, TypeScript.

## Global Constraints

- Package manager is **npm** (per `instructions.md`). Never generate a pnpm/yarn/bun lockfile.
- **One** connection only, via `lib/mongodb.ts` global-cached client. No driver calls in components/pages.
- Connection string in **`MONGODB_URI`** (`.env.local`); mirror the key (no secret) in `.env.example`. Never hardcode credentials.
- `readDb`/`writeDb` keep identical *semantics* but become **async** — `readDb` resolves to `[]` for an empty collection; `writeDb` overwrites the whole collection. Every caller adds `await`.
- The app-level `id` field must stay distinct from Mongo's `_id`; `_id` must never leak into API responses or app types.
- Atlas M0 is a replica set → multi-doc **transactions are available**; use one for `writeDb`'s delete+insert so a mutation is atomic.
- Data no longer lives in git. Questions are loaded via `/import` or a seed script (Task 6), not committed.
- Imports use the `@/*` alias.
- No comments unless a WHY is non-obvious (project convention).

---

## File Structure

- `lib/mongodb.ts` — **new**. Cached `MongoClient` + `getDb()` returning a `Db`.
- `lib/db.ts` — **rewritten**. `readDb`/`writeDb` become async wrappers over `getDb()`. Adds `resetDbForTests()`.
- `lib/db.test.ts` — **new**. Vitest tests against an in-memory Mongo.
- `scripts/seed-mongo.mjs` — **new**. One-off: loads existing `data/*.json` into Atlas.
- `.env.local` — **modified** (local only, git-ignored). `MONGODB_URI=...`
- `.env.example` — **modified**. `MONGODB_URI=` placeholder.
- `vitest.config.ts` — **new**. Test runner config.
- `package.json` — **modified**. Add `mongodb`; dev `vitest`, `mongodb-memory-server`; `test` + `seed:mongo` scripts.
- All `app/api/**/route.ts` — **modified**. Add `await` to every `readDb`/`writeDb` call.

---

### Task 1: Test runner + MongoDB dependencies

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `npm test` running Vitest (Node env); `mongodb` importable; `mongodb-memory-server` for tests.

- [ ] **Step 1: Install dependencies**

```bash
npm install mongodb
npm install -D vitest mongodb-memory-server
```

- [ ] **Step 2: Add scripts to `package.json`**

```json
"test": "vitest run",
"test:watch": "vitest",
"seed:mongo": "node scripts/seed-mongo.mjs"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", testTimeout: 20000 },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

(`testTimeout` is raised because `mongodb-memory-server` downloads/boots a binary on first run.)

- [ ] **Step 4: Verify the runner starts**

Run: `npm test`
Expected: Vitest runs, reports "No test files found".

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest + mongodb driver for atlas migration"
```

---

### Task 2: Cached connection singleton (`lib/mongodb.ts`)

**Files:**
- Create: `lib/mongodb.ts`

**Interfaces:**
- Produces:
  - `getDb(): Promise<Db>` — resolves the app database from a cached client.
  - Reads `MONGODB_URI` (required) and optional `MONGODB_DB` (defaults to `recall`).

- [ ] **Step 1: Write the module**

```ts
import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? "recall";

// Cache across hot reloads (dev) and serverless invocations (prod).
const globalForMongo = globalThis as unknown as {
  _mongoClientPromise?: Promise<MongoClient>;
};

function clientPromise(): Promise<MongoClient> {
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (!globalForMongo._mongoClientPromise) {
    globalForMongo._mongoClientPromise = new MongoClient(uri).connect();
  }
  return globalForMongo._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  return client.db(dbName);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/mongodb.ts
git commit -m "feat: cached mongodb connection singleton"
```

---

### Task 3: Async `readDb`/`writeDb` over Mongo + tests

**Files:**
- Create: `lib/db.test.ts`
- Modify: `lib/db.ts` (full rewrite)

**Interfaces:**
- Produces:
  - `readDb<T>(name: string): Promise<T[]>` — all docs in collection `name.replace(/\.json$/, "")`, with `_id` projected out; `[]` if empty.
  - `writeDb<T>(name: string, data: T[]): Promise<void>` — replaces the whole collection (transactional delete+insert).
  - `resetDbForTests(): void` — clears the cached client so a test can point at a fresh in-memory URI.
- Consumes: `getDb` from Task 2.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/db.test.ts
import { beforeAll, afterAll, beforeEach, expect, test } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { readDb, writeDb, resetDbForTests } from "@/lib/db";

let mongo: MongoMemoryReplSet;

beforeAll(async () => {
  // Replica set so transactions (used by writeDb) work.
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "recall_test";
});

afterAll(async () => {
  resetDbForTests();
  await mongo.stop();
});

beforeEach(async () => {
  await writeDb("cards.json", []);
  await writeDb("tags.json", []);
});

test("readDb returns [] for an empty collection", async () => {
  expect(await readDb("cards.json")).toEqual([]);
});

test("writeDb then readDb round-trips without leaking _id", async () => {
  const cards = [{ id: "a", question: "Q1" }, { id: "b", question: "Q2" }];
  await writeDb("cards.json", cards);
  const read = await readDb<{ id: string; question: string }>("cards.json");
  expect(read).toEqual(cards);
  expect(read.some((c) => "_id" in c)).toBe(false);
});

test("writeDb overwrites the whole collection", async () => {
  await writeDb("tags.json", [{ id: "1" }, { id: "2" }]);
  await writeDb("tags.json", [{ id: "9" }]);
  expect(await readDb("tags.json")).toEqual([{ id: "9" }]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — async Mongo-backed `readDb`/`writeDb` not implemented.

- [ ] **Step 3: Rewrite `lib/db.ts`**

```ts
import { getDb } from "@/lib/mongodb";

function collectionName(name: string): string {
  return name.replace(/\.json$/, "");
}

export async function readDb<T>(name: string): Promise<T[]> {
  const db = await getDb();
  const docs = await db
    .collection(collectionName(name))
    .find({}, { projection: { _id: 0 } })
    .toArray();
  return docs as T[];
}

export async function writeDb<T>(name: string, data: T[]): Promise<void> {
  const db = await getDb();
  const client = (db as unknown as { client: import("mongodb").MongoClient }).client;
  const coll = db.collection(collectionName(name));
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await coll.deleteMany({}, { session });
      if (data.length > 0) {
        await coll.insertMany(data as Record<string, unknown>[], { session });
      }
    });
  } finally {
    await session.endSession();
  }
}
```

> Note: `insertMany` mutates inputs by adding `_id`. If a caller reuses the array afterwards, that stray `_id` is harmless (routes re-read via `readDb`, which projects it out), but if strictness is needed, deep-clone `data` before insert.

- [ ] **Step 4: Add `resetDbForTests` to `lib/mongodb.ts`**

Append to `lib/mongodb.ts`:

```ts
export function resetDbForTests(): void {
  globalForMongo._mongoClientPromise = undefined;
}
```

And re-export from `lib/db.ts`:

```ts
export { resetDbForTests } from "@/lib/mongodb";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all three).

- [ ] **Step 6: Commit**

```bash
git add lib/db.ts lib/db.test.ts lib/mongodb.ts
git commit -m "feat: async mongodb-backed readDb/writeDb"
```

---

### Task 4: Make every route await the data layer

**Files:**
- Modify: every `app/api/**/route.ts` that calls `readDb`/`writeDb` (cards, cards/[id], cards/bulk, tags, tags/[id], groups, groups/[id], bin, bin/restore, bin/[id], bin/bulk-delete, sessions, sessions/stats, import). Also any Server Component page that calls `readDb` directly (e.g. `app/analytics/page.tsx`, `app/groups/page.tsx`, `app/page.tsx`).

**Interfaces:**
- Consumes: async `readDb`/`writeDb` from Task 3.

- [ ] **Step 1: Find every call site**

Run: `grep -rn "readDb\|writeDb" app lib --include=*.ts --include=*.tsx`
Expected: a list of all usages to update.

- [ ] **Step 2: Add `await` at each call site**

For each usage, change `const x = readDb<T>("f.json")` → `const x = await readDb<T>("f.json")` and `writeDb("f.json", next)` → `await writeDb("f.json", next)`. All API handlers are already `async`; Server Component pages that read data are already `async` (or make them `async`). Example (cards POST, `app/api/cards/route.ts`):

```ts
const cards = await readDb<Card>("cards.json");
cards.push(card);
await writeDb("cards.json", cards);
```

- [ ] **Step 3: Typecheck catches any missed await**

Run: `npx tsc --noEmit`
Expected: no errors. A missed `await` surfaces as `Property 'push' does not exist on type 'Promise<...>'` or `Type 'Promise<...>' is not assignable` — fix each until clean.

- [ ] **Step 4: Commit**

```bash
git add app lib
git commit -m "refactor: await async data layer across all routes"
```

---

### Task 5: Env wiring

**Files:**
- Modify: `.env.local` (create if absent; git-ignored)
- Modify: `.env.example`

**Interfaces:**
- Produces: `MONGODB_URI` available to the running app.

- [ ] **Step 1: Create an Atlas M0 cluster + DB user**

In MongoDB Atlas: create a free M0 cluster, a database user, and allow-list your IP (and `0.0.0.0/0` for Vercel, or Vercel's egress). Copy the SRV connection string.

- [ ] **Step 2: Set `.env.local`**

```
MONGODB_URI="mongodb+srv://<user>:<pass>@<cluster>/?retryWrites=true&w=majority"
MONGODB_DB="recall"
```

- [ ] **Step 3: Update `.env.example`**

```
MONGODB_URI=
MONGODB_DB=recall
```

- [ ] **Step 4: Verify a route talks to Atlas**

Run: `npm run dev` then `curl -s localhost:3000/api/cards`
Expected: HTTP 200 with `[]` (empty until Task 6 seeds).

- [ ] **Step 5: Commit**

```bash
git add .env.example
git commit -m "chore: document MONGODB_URI env var"
```

---

### Task 6: Seed Atlas from existing JSON

**Files:**
- Create: `scripts/seed-mongo.mjs`

**Interfaces:**
- Consumes: existing `data/*.json`, `MONGODB_URI`.
- Produces: populated Atlas collections.

- [ ] **Step 1: Write the seed script**

```js
// scripts/seed-mongo.mjs
import { MongoClient } from "mongodb";
import fs from "node:fs";
import path from "node:path";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");
const dbName = process.env.MONGODB_DB ?? "recall";

const DATA_DIR = path.join(process.cwd(), "data");
const FILES = ["cards.json", "tags.json", "sessions.json", "groups.json", "bin.json"];

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

for (const file of FILES) {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) continue;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    console.warn(`skip ${file}: invalid JSON`);
    continue;
  }
  if (!Array.isArray(parsed)) {
    console.warn(`skip ${file}: not an array`);
    continue;
  }
  const coll = db.collection(file.replace(/\.json$/, ""));
  await coll.deleteMany({});
  if (parsed.length > 0) await coll.insertMany(parsed);
  console.log(`seeded ${file}: ${parsed.length} docs`);
}

await client.close();
console.log("done");
```

- [ ] **Step 2: Run the seed**

Run: `npm run seed:mongo`
Expected: `seeded <file>: N docs` per existing JSON file; `done`.

- [ ] **Step 3: Full regression pass**

Run: `npm run dev` and manually verify: dashboard, `/cards` list, create/edit/delete a card (delete → `/bin`), restore, run a test to completion (session saves), `/analytics` renders. Each exercises the async data layer end-to-end.
Expected: identical behaviour to pre-migration.

- [ ] **Step 4: Retire the JSON files (optional) + typecheck/tests**

```bash
git rm data/cards.json data/tags.json data/sessions.json data/groups.json data/bin.json
npx tsc --noEmit && npm test
```

Expected: no type errors; all `lib/db.test.ts` tests pass. (Keep a local backup of the JSON before removing, as a rollback net.)

- [ ] **Step 5: Add `MONGODB_URI`/`MONGODB_DB` to Vercel project env, then commit**

Set both vars in the Vercel dashboard (Production + Preview). Then:

```bash
git add -A
git commit -m "feat: migrate data store to mongodb atlas"
```

---

## Self-Review

- **Spec coverage:** "use mongodb atlas for storage" → Tasks 2–6 replace the store with Atlas while preserving `readDb`/`writeDb` semantics (now async). ✔
- **Writable-in-prod:** achieved — Atlas is hosted; runtime writes (sessions, bookmarks, SRS) now persist everywhere including mobile. The old read-only caveats in the roadmap are removed. ✔
- **`_id` isolation:** `readDb` projects `_id` out; app types unchanged; test asserts no `_id` leak. ✔
- **Connection reuse:** single global-cached client; no per-request connect. ✔
- **Placeholder scan:** every code step is complete; no TODO/TBD. ✔
- **Type consistency:** `readDb`/`writeDb`/`resetDbForTests` and `getDb` signatures are consistent across Tasks 2–4 and match callers after the `await` refactor. ✔
- **Known follow-up (not a gap):** whole-collection replace in `writeDb` is behaviour-preserving but not idiomatic Mongo; hot paths (session insert, single-card CRUD) should move to per-document ops in a later pass. Recorded in the roadmap.
