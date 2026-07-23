# Recall Upgrades — Roadmap & Per-Feature Scope

**Date:** 2026-07-23
**Owner decisions locked this session:**
- Storage: **MongoDB Atlas** (hosted, **writable in production** — see `2026-07-23-mongodb-migration.md`). Data lives in the cloud DB, not git; questions load via `/import` or a seed script.
- Cloze & Match scoring: **all-or-nothing** (keeps `SessionResult.correct` a single boolean — no analytics changes).
- Image support: **deferred**.
- App is **mobile-first**, also used on laptop.

> **Storage note:** this supersedes the earlier "local SQLite, read-only prod" decision. Because Atlas is writable everywhere, the read-only-on-phone constraints below no longer apply — sessions save on phone, bookmarks are server-side, and SRS schedule writes persist on every device.

Each feature below is an independent subsystem and gets its **own full TDD plan** (`docs/superpowers/plans/YYYY-MM-DD-<feature>.md`) when it's picked up. This roadmap fixes the **sequence, scope, file touch-map, interfaces, and the traps** so those plans can be written fast and correctly.

---

## Writable prod (MongoDB Atlas) — every feature persists everywhere

Atlas is hosted and writable, so runtime writes persist on **every device, including the phone**:

| Feature | Persists on phone (prod)? |
| --- | --- |
| Cloze / Match / Flashcard cards | yes — sessions save; analytics update on the go |
| Bookmark / Flag ⭐ | yes — **server-side**, synced laptop ↔ phone |
| Quick Test from browser | yes (no writes anyway) |
| SRS scheduler | yes — schedule advances wherever you study |

No feature needs a read-only workaround anymore. (An earlier draft used `localStorage` for bookmarks to survive a read-only file store; with Atlas, bookmarks are a normal server-backed collection/field — see Feature 6.)

---

## Dependency order (build in this sequence)

```
1. MongoDB Atlas migration (foundation — separate plan, already written)
        │
        ├─ 2. Quick Test from Card Browser   (no storage/schema change — smallest, do first for a quick win)
        │
        ├─ 3. Cloze card kind                (schema + CardForm + TestSession + result + import/export)
        ├─ 4. Match-the-following card kind   (same touch-points as cloze; reuse its scaffolding)
        ├─ 5. Flashcard card kind (swipe)     (self-graded; new gesture UI)
        │
        ├─ 6. Bookmark / Flag ⭐              (server-side flag; independent of card kinds)
        │
        └─ 7. Spaced-repetition scheduler     (RECOMMENDED — needs relational tables; do after ≥1 card kind ships)
```

Tasks 3–6 are mutually independent and can be parallelised across separate worktrees. Task 7 is the highest-value *new* idea and should reuse the SRS-friendly relational tables it introduces.

---

## The "add a card kind" contract (shared by 3, 4, 5)

Every new kind touches the **same eight** places (documented in `CLAUDE.md` → "Add a new card kind"). Verified against current code:

1. `types/index.ts` — extend `CardKind`; add the kind's payload field to `Card`.
2. `app/api/cards/route.ts` `POST` — branch validation on `kind` (mirrors the existing `normalizeStatements` / `statements.length < 2` block at `route.ts:25-58`).
3. `app/api/cards/[id]/route.ts` `PUT` — normalize/merge the new field.
4. `components/CardForm.tsx` — add the kind to the segmented control (`["mcq","tf-sort"]` at `CardForm.tsx:162`), a branched body, and payload construction (`CardForm.tsx:120-135`). Add validation to `validate()` (`CardForm.tsx:81-94`).
5. `app/test/session/TestSession.tsx` — extend `PreparedCard` (`TestSession.tsx:22-26`), the `prepared` derivation (`TestSession.tsx:44-76`), per-card reset (`TestSession.tsx:90-98`), correctness via `recordAndAdvance(conf, "", overrideCorrect)` (`TestSession.tsx:129-151`), a JSX branch, and the keyboard handler (`TestSession.tsx:176-247`).
6. `app/test/result/ResultView.tsx` — missed-row rendering for the kind.
7. `app/cards/CardsBrowser.tsx` — kind badge + summary line.
8. Import/export round-trip — `lib/export.ts`, `app/api/import/route.ts`, and `validateCard` in `app/import/ImportView.tsx`.

**Invariant to protect in all three:** `SessionResult.correct` stays a single boolean, derived via the `overrideCorrect` arg. No per-blank/per-pair scores in the session record.

---

## Feature 2 — Quick Test from Card Browser (smallest; do first)

**Value:** high · **Effort:** low · **Storage:** none

**What:** selection mode already exists in `CardsBrowser.tsx` (Select All / bulk delete). Add a **"Test selected →"** action that launches a session on exactly those card IDs — no Group, no setup screen.

**Design:** the session URL contract is tag-based today (`/test/session?tags=…`). Add an **`ids=` param** alongside it.
- `app/test/session/TestSession.tsx`: read `params.get("ids")`; when present, build `pool` from those IDs directly (bypass the tag-expansion branch at `TestSession.tsx:53-59`). `ids` and `tags` are mutually exclusive; `ids` wins.
- `app/cards/CardsBrowser.tsx`: add a button in the selection action bar → `router.push("/test/session?ids=" + selected.join(",") + "&shuffle=true")`.

**Interface added:** `/test/session?ids=ID,ID&shuffle=true`.

**Traps:** the `prepared` memo runs once on mount with `[]` deps — reading `ids` there is fine. Keep `beforeunload` + finish flow unchanged. Retry mode (`retry=1`) still takes precedence over both `ids` and `tags`.

---

## Feature 3 — Cloze deletion cards

**Value:** high · **Effort:** medium · **Storage:** schema field only

**Data model:** add to `Card`:
```ts
kind?: "mcq" | "tf-sort" | "cloze" | "match" | "flash";
clozeText?: string;            // e.g. "React was created by {Facebook} in {2013}."
```
Blanks are parsed from `clozeText` with a `{...}` delimiter — no separate `ClozeBlank[]` array needed (single source of truth = the text). A shared parser `lib/cloze.ts` → `parseCloze(text): { segments: string[]; blanks: string[] }` powers CardForm preview, TestSession rendering, and grading.

**Authoring (CardForm):** a single textarea; select text → **"Cloze it"** button wraps the selection in `{…}`. Live preview shows blanks as `___`. Validation: ≥1 blank.

**Test session:** render segments with `<input>` per blank. Grade **all-or-nothing**: every blank's trimmed, case-insensitive (configurable later) value must equal the answer. `recordAndAdvance(conf, "", allBlanksCorrect)`.

**Result view:** missed row shows the full text with correct blank fills highlighted.

**Traps:** the keyboard handler skips events from `INPUT` targets (`TestSession.tsx:179`) — cloze relies on real inputs, so typing already won't trigger shortcuts. Provide an explicit **Submit** button + `Enter`-to-submit only when focus is outside inputs. Escaping literal `{`/`}` in questions: document that `{{` renders a literal brace (handle in `parseCloze`).

---

## Feature 4 — Match the following (tap to pair)

**Value:** medium-high · **Effort:** medium · **Storage:** schema field only

**Data model:**
```ts
pairs?: { left: string; right: string }[];   // match cards, ≥2 pairs
```

**Test session (mobile-first):** show left column fixed, right column **shuffled**. Tap a left item then a right item to link them (or tap-left → tap-right). Show current links with a connecting colour/number. Grade all-or-nothing: every left maps to its correct right. `recordAndAdvance(conf, "", allPairsCorrect)`.

**Authoring (CardForm):** rows of `left | right` inputs, add/remove, min 2.

**Traps:** tapping is the primary interaction (matches the app's "row-click is primary" convention). Keep a keyboard fallback (number keys to select left, letter keys for right) but tap is the design target. Shuffle the right column in the `prepared` memo like `options`/`statementOrder` already are.

---

## Feature 5 — Flashcards (tap to flip, swipe to grade)

**Value:** high (core to a revision app) · **Effort:** medium · **Storage:** schema field only

**Data model:** reuse `question` (front) + `answer` (back); `kind: "flash"`. No new field strictly required — a flash card is a front/back pair.

**Interaction (mobile-first):**
- Tap card → flip (CSS 3D flip; front=question, back=answer + explanation).
- **Swipe right = "Know it"** → `correct: true`. **Swipe left = "Review again"** → `correct: false`.
- Desktop keys: `→`/`K` = know, `←`/`J` = review, `Space` = flip.

This is **self-graded** — there's no objective answer to compare. Map "Know it" → `overrideCorrect: true`, "Review again" → `false`, so it flows through the same session pipeline and analytics unchanged. Confidence step: optional — "Know it/Review" already carries the signal; simplest is to auto-set confidence (Know=3, Review=1) and skip the extra confidence screen for flash cards.

**Traps:** swipe needs pointer/touch handling — use a small self-contained pointer-drag hook (`hooks/useSwipe.ts`), no new dependency (instructions.md: no new libs without permission). Respect `prefers-reduced-motion` for the flip. Don't break the shared `recordAndAdvance` signature.

---

## Feature 6 — Bookmark / Flag ⭐ "Review later"

**Value:** high · **Effort:** low · **Storage:** server-side (Atlas — syncs across devices)

**Design:** add a `bookmarked?: boolean` field to `Card` (simplest — one flag per card, no join). Toggle it via the existing `PUT /api/cards/[id]` merge, or a tiny dedicated `PATCH /api/cards/[id]/bookmark` for a one-field write that avoids re-validating the whole card.
- Add a ⭐ toggle on: `CardsBrowser.tsx` rows, the test **result** missed-rows, and optionally the in-session card.
- `CardsBrowser.tsx`: add a **"Bookmarked"** filter chip alongside the existing search/tag/difficulty filters.
- Launch a review of bookmarks: reuse Feature 2's `ids=` param → `/test/session?ids=<bookmarked ids>`, or add a `bookmarked=1` pool filter to the session.

**Why server-side now:** Atlas is writable in prod, so the flag persists and **syncs laptop ↔ phone** — no `localStorage` workaround needed. (An earlier draft used `localStorage` only because the store was read-only; that constraint is gone.)

**Traps:** keep `bookmarked` out of the all-or-nothing export unless wanted; `PATCH` should touch only the one field so it doesn't clobber concurrent edits.

---

## Feature 7 — Spaced-repetition scheduler (RECOMMENDED new idea)

**Value:** highest · **Effort:** medium-high · **Storage:** new Atlas collection

**Why:** the app is named *Recall* and sells "spaced revision," but tests are currently random subsets — there is no per-card **due date**. A scheduler ("review what's due today") is the single biggest value-add and turns this from a quiz app into an actual SRS.

**Design:**
- Add a `reviews` collection in Atlas: `{ cardId, ease, intervalDays, dueAt, lastReviewedAt }`, one doc per card, indexed on `dueAt` (and `cardId`). This is a natural first use of a **per-document** collection (vs the whole-collection `writeDb` the foundation ships with) — write it with direct `getDb()` collection ops.
- After each answered card, update its schedule with **SM-2** (simple, well-documented) using the `confidence`/correctness already captured. Put the algorithm in `lib/srs.ts` (pure, fully unit-testable — ideal TDD).
- New entry point: **"Due today (N)"** on the dashboard → `/test/session?due=1`, which pools cards whose `dueAt <= now`.
- Analytics gains a "due / overdue / scheduled" view.

**Prod note:** Atlas is writable, so schedule updates persist on **every device** — the schedule advances wherever you study (phone or laptop). No caveat.

---

## Other improvements worth considering (not yet scoped)

- **PWA / installable + offline** — you're mobile-first; an installable PWA that caches fetched cards (service worker + a client cache) lets you review offline and feel native, syncing writes back to Atlas when back online. High impact, moderate effort. Strong candidate right after the card kinds.
- **Streaks / daily goal** — cheap motivation layer once the SRS scheduler exists.
- **Full-text card search** — a MongoDB text index (or Atlas Search) makes this trivial; nice for large decks.
- **Lift `cardHistory`/latest-per-card into `lib/`** — `CLAUDE.md` notes the analytics + dashboard duplicate this; the SRS work is the natural moment to extract it.

---

## Execution notes

- Do the **MongoDB Atlas migration plan first** — it is the foundation and is already written (`2026-07-23-mongodb-migration.md`).
- Then **Feature 2** for a fast, low-risk win.
- Card kinds (3/4/5) share the eight-touch-point contract above — build one end-to-end first (suggest **Flashcards**, since it's the most valuable and exercises the mobile gesture patterns), then the others reuse the scaffolding.
- Per `instructions.md`: after each feature, update `docs/ai-memory/02-features-log.md`, `03-decisions.md`, `04-current-state.md`, and `README.md` if setup changed. (Create `docs/ai-memory/` if missing — the migration plan is a good first entry.)
