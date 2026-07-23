# Recall

A local-first, single-user flashcard app for spaced revision. Built on Next.js 16
(App Router) + React 19 + Tailwind v4, with **MongoDB** as the data store.

Five card kinds are supported: classic **MCQ** (multiple choice), **tf-sort** (True/False statement sorting), **flash** (classic front/back cards), **cloze** (cloze deletion fill-in-the-blank), and **match** (pair matching game). The app features a complete spaced-repetition review system powered by the **FSRS** (Free Spaced Repetition Scheduler) algorithm.

## Stack

| Concern     | Choice                                    |
| ----------- | ----------------------------------------- |
| Framework   | Next.js 16.2.6 (App Router, Turbopack)    |
| UI          | React 19 + Tailwind v4                     |
| HTTP client | Axios (`lib/api.ts`)                       |
| Charts      | Recharts                                   |
| Database    | MongoDB (cached client in `lib/mongodb.ts`) |
| Tests       | Vitest + mongodb-memory-server            |
| Auth        | None — single-user                         |

## Data storage & sync

- **Source of truth: MongoDB Atlas.** The app (localhost *and* the Vercel
  deployment) connects to `MONGODB_URI`. Writes work in production.
- **Local mongod is a one-way mirror** of Atlas, kept fresh so the laptop
  always holds a recent copy. The app never uses local as its data source —
  writing to local directly will be overwritten by the mirror.
- `readDb`/`writeDb` (`lib/db.ts`) are async and Mongo-backed. `writeDb` uses a
  transaction on Atlas/replica-sets and an atomic temp-collection rename on a
  standalone mongod.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` (copy from `.env.local.example`):

   ```
   MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/?retryWrites=true&w=majority
   MONGODB_DB=recall
   LOCAL_MONGODB_URI=mongodb://127.0.0.1:27017/?retryWrites=false
   ```

3. Seed the database from the JSON snapshots in `data/`:

   ```bash
   npm run seed:mongo
   ```

## Scripts

```bash
npm run dev          # Next dev server (uses Atlas via MONGODB_URI)
npm run dev:synced   # pull Atlas->local once, then live mirror + next dev
npm run build        # production build (types checked here)
npm run start        # production server
npm run lint         # eslint
npm test             # vitest (data-layer tests)

npm run seed:mongo   # seed the DB from data/*.json
npm run sync:local   # one-shot copy Atlas -> local mongod
npm run mirror:watch # live change-stream mirror Atlas -> local
```

For local dev with the mirror running, use **`npm run dev:synced`** — it pulls
the latest from Atlas (closing any gap from while the laptop was off), then runs
the live mirror watcher alongside `next dev`.

## Deploy (Vercel)

Set `MONGODB_URI` and `MONGODB_DB` in the Vercel project env (Production +
Preview). The runtime filesystem is read-only, but data lives in MongoDB, so
runtime writes work. Allow-list Vercel egress in Atlas Network Access (or
`0.0.0.0/0`).

## Docs

See `docs/ai-memory/` for the project overview, architecture, feature log,
decisions, and current state.
