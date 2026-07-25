# Recall

A local-first, single-user flashcard app for spaced revision. Built on Next.js 16 (App Router) + React 19 + Tailwind v4, with **MongoDB** as the data store.

Five card kinds are supported: classic **MCQ** (multiple choice), **tf-sort** (True/False statement sorting), **flash** (classic front/back cards), **cloze** (cloze deletion fill-in-the-blank), and **match** (pair matching game). The app features a complete spaced-repetition review system powered by the **FSRS** (Free Spaced Repetition Scheduler) algorithm.

---

## Stack

| Concern     | Choice                                                  |
| ----------- | ------------------------------------------------------- |
| Framework   | Next.js 16.2.6 (App Router, Turbopack)                  |
| UI          | React 19 + Tailwind v4                                   |
| HTTP client | Axios (`lib/api.ts`)                                     |
| Charts      | Recharts                                                 |
| Database    | MongoDB (cached client in `lib/mongodb.ts`)             |
| Tests       | Vitest + mongodb-memory-server                          |
| Auth        | Google Sign-In (HttpOnly cookies + API Key bypass)      |

---

## Chrome Extension Integration

A companion Chrome Extension (`extension/`, MV3, Vite + TS, pnpm workspace) allows:
- **Instant YouTube Frame Capture:** Press configurable hotkeys (Alt+Shift+Q/F/C/T/M) to take a screenshot of the YouTube player, perform OCR draft extraction, and open an in-page review/edit overlay.
- **Web Text Capture:** Highlight text on any web page, right-click, and select "Add Question" to invoke Gemini AI card drafting.
- **Offline Synchronization:** Drafts are saved in an offline queue and synced to the Recall dashboard once online.

---

## Data Storage & Sync

- **Source of Truth: MongoDB Atlas.** The app connects to `MONGODB_URI`. All writes persist in Atlas.
- **Local mongod is a one-way mirror** of Atlas, kept fresh so the app runs offline. Writing to local directly will be overwritten by the mirror.
- `readDb`/`writeDb` (`lib/db.ts`) are async and Mongo-backed. `writeDb` uses a transaction on Atlas/replica-sets.

---

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env.local` (copy from `.env.local.example`):
   ```ini
   MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/?retryWrites=true&w=majority
   MONGODB_DB=recall
   LOCAL_MONGODB_URI=mongodb://127.0.0.1:27017/?retryWrites=false

   # Google Auth (restricted to ALLOWED_EMAIL)
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
   ALLOWED_EMAIL=your-email@gmail.com
   JWT_SECRET=your-secure-jwt-secret
   RECALL_API_KEY=your-extension-api-key
   ```
3. Seed the database from the JSON snapshots in `data/`:
   ```bash
   npm run seed:mongo
   ```

### Windows Start Menu & Auto-Start Setup
To configure Recall to run silently as a background service on login and add a high-resolution, borderless browser app shortcut to your Start Menu:
1. Open PowerShell and run the setup script:
   ```powershell
   d:\code\personal_projects\recall\scripts\setup-shortcuts.ps1
   ```
2. See [setup-shortcuts.md](file:///d:/code/personal_projects/recall/setup-shortcuts.md) for more details on the start configuration modes.

---

## Scripts

```bash
npm run dev          # Next dev server
npm run dev:synced   # pull Atlas->local once, then live mirror + next dev
npm run build        # production build (types checked here)
npm run start        # production server
npm run app:start    # pull Atlas->local, then run production server
npm run lint         # eslint
npm test             # vitest (data-layer tests)

npm run seed:mongo   # seed the DB from data/*.json
npm run sync:local   # one-shot copy Atlas -> local mongod
npm run mirror:watch # live change-stream mirror Atlas -> local
```

---

## Deploy (Vercel)

Set environment variables in your Vercel dashboard. The runtime filesystem is read-only, but writes are routed to MongoDB Atlas. Ensure Vercel egress IPs are allow-listed in Atlas Network Access.

---

## Docs

- [setup-shortcuts.md](file:///d:/code/personal_projects/recall/setup-shortcuts.md) — Windows startup and Start Menu integration guide.
- `docs/ai-memory/` — Project overview, architecture logs, decisions history, and current app state.
