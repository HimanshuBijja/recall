# 04 — Current State

_Last updated: 2026-07-25_

## Branch
`master`. Everything below is merged and committed (local; **not yet pushed**).
Includes: MongoDB migration + Atlas→local mirror, the Flash/Cloze/Match/
Bookmarks/FSRS feature set (built by the Antigravity/Gemini agent), the
build/lint hardening pass, the FSRS persistence fix + `/settings` page
(commit `ed5f25f`), the **YouTube capture extension + capture backend +
analytics/import upgrades** (commit `f889715`, built by 4 parallel subagents),
and the **Web text capture (any site)** feature.

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
  captures a video frame → `POST /api/capture` (Gemini drafts a card + R2 stores
  the frame) → in-page overlay to review/edit → `POST /api/cards`. Per-kind
  timeline markers + filters.
  * **MCQ & Multi Segregation:** Kept completely separate without conversion switches or data loss. MCQ uses radio-button correct checkmarks; Multi uses multi-checkbox checkmarks.
  * **Single-Tag Concept Generation:** Gemini prompt in `lib/gemini.ts` extracts exactly 1 tag representing the main topic taught in the video title.
  * **Extension Tag Selector:** Custom TagSelector chip component in the content overlay fetches tags via `GET_TAGS` and offers autocompletion / dropdown selection on Enter/Tab/Comma/Click or inline tag creation.
  * **Inline AI Editor:** Google Colab-style floating editing system inside overlay input/textarea fields. Highlights selection with a floating "Ask AI" button. Opens a minimal input box (textarea that grows up to 3 lines) with a circle up-arrow send button. Queries `/api/edit` API route and displays minimal circular accept (✓) / decline (✗) action icons.
  * **Global AI Editor:** Sparkle SVG button in the top-right of the card overlay. Queries `/api/edit` with the entire card context and user prompt. Replaced separate popover tooltip blocks with clean inline comparison blocks that flow directly inside the form layout, temporarily hiding the raw text fields. Displays original text (red, strikethrough) and suggested text (green) stacked vertically under each other. Uses defensive `insertBefore` or `appendChild` DOM insertion. At the top-right of the diff block, a modern dark pill `[ ✓ ] [ ✗ ]` offers direct keep/revert operations.
  * **Overlay Code Modularization & Diff Layout Fix:** Split the large `overlay.ts` into `styles.ts` (CSS rules) and `ai.ts` (inline and global AI editing logic). Solved the layout bug where inline modular changes (diff overlays) were not visible or squashed inside horizontal option rows by setting `display: none` on targets / `.option-row` wrappers, allowing the vertical diff container to render at full width.
  * **UI Theme Revamp:** Refactored popup HTML/CSS, options configuration sheet, content overlays, toast alerts, load banners, and progress pills to match the cinematic editorial theme from `design.md` (backgrounds/cards/sections `#181818`, text `#EBDCC4`, secondary labels `#B6A596`, borders `#4A4441`, and accent highlights `#DC9F85`, replacing all legacy blue and obsidian gray colors). SVG size properties are placed strictly on outer wrappers to prevent icons collapsing.
  `Card.source` provenance; lazy "Show frame" in Test/Result/Cards. **Extension
  not yet smoke-tested against live Gemini/R2 — user's manual step.**
- **Web text capture** (any site): select text → right-click **Add question** →
  count + kind modal → `POST /api/generate` (Gemini, no image) → batch overlay
  listing all N drafts (MCQ/multi in a grid table, other kinds via the existing
  per-kind renderers, per-card AI editing) → one `SAVE_CARDS` round trip.
  Cards get a `{ type: "web", url, title, siteName, excerpt, capturedAt }`
  source; they never auto-create groups and never appear under analytics
  "By video".
- **Analytics**: pure metrics in `lib/analytics.ts`; forecast now local-day
  bucketed; new **"By video"** per-source accuracy section.
- **Import**: alias paste formats (cloze/tf-sort/match), dedupe badges +
  skip-duplicates + bulk-tag in the preview.

## Verification (all green as of this update)
- Recall `npx tsc --noEmit` → clean; `npm run lint` → 0 errors (3 pre-existing
  warnings); `npx vitest run` → **117 pass** (38 files).
- Extension `pnpm --dir extension exec tsc --noEmit` → clean; `vitest` → **48
  pass** (12 files); `pnpm build` → OK.
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
- **Web-captured cards have no UI surface that shows their source page** — `/cards`
  shows the frame for video sources but nothing for web sources yet.

## Next suggested step
Push `master`, then deploy to Vercel (with Atlas env vars set) and smoke-test a
live due-review session.
