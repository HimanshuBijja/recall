# FSRS scheduling fixes + Settings page with interval visualizer

_Design spec — 2026-07-23_

## Motivation

Two things:

1. **Bug:** the FSRS persistence layer (`lib/srs.ts`) drops two fields the
   ts-fsrs 5.4 scheduler needs — `learning_steps` and `lapses`. Because every
   review round-trips through MongoDB, `learning_steps` resets to `0` on every
   review, so a card in the Learning state never graduates unless answered
   "Easy". Cards answered Hard (confidence 1) or Good (confidence 2) get pinned
   in a sub-10-minute loop forever instead of entering real spaced repetition.
   Existing tests all use confidence 3 (Easy), the one path that survives, so
   the bug went undetected.
2. **Feature:** there is no way to configure FSRS or to see how a change to the
   parameters affects scheduling. Add a `/settings` page that configures a
   practical subset of FSRS params and shows a live interval visualizer.

## Part A — Bug fixes

### A1. Persist all scheduler fields
- `FsrsState` (`types/index.ts`) gains `learning_steps: number` and
  `lapses: number`.
- `serialize` / `deserialize` (`lib/srs.ts`) copy both fields.
- Old stored reviews reading back `undefined` self-heal on their next review
  (ts-fsrs normalizes missing fields to 0); no migration needed.

### A2. Forecast naming honesty
- `getReviewsSummary` (`lib/due.ts`) has a helper named `getLocalDateString`
  that actually returns a UTC date. Rename to `getUtcDateString`. Bucketing
  stays UTC — switching to the user's local timezone is a separate behavior
  change and out of scope.

### A3. Regression tests
- Add round-trip tests exercising the **Good** and **Hard** paths: after a few
  reviews through a full serialize→deserialize cycle, the card reaches the
  Review state (2) and its interval grows past the learning-step range.

## Part B — Settings + visualizer

### Data model
- New `settings` Mongo collection, a single config document.
- `FsrsSettings` (`types/index.ts`):
  ```ts
  interface FsrsSettings {
    request_retention: number;   // 0.70 – 0.97
    maximum_interval: number;    // days
    learning_steps: string[];    // e.g. ["1m","10m"]
    relearning_steps: string[];  // e.g. ["10m"]
    enable_fuzz: boolean;
    enable_short_term: boolean;
  }
  ```

### `lib/settings.ts`
- `DEFAULT_FSRS_SETTINGS` — mirrors ts-fsrs defaults.
- `readSettings()` — reads the `settings` collection, merges the stored doc over
  the defaults (missing/new fields safe), returns `FsrsSettings`.
- `writeSettings(s)` — validates and persists the single doc.
- `toGeneratorParameters(s)` — maps `FsrsSettings` to the ts-fsrs
  `generatorParameters()` input shape.
- `parseSteps(text)` / `formatSteps(arr)` — convert between `"1m, 10m"` UI text
  and `["1m","10m"]`. `parseSteps` validates each token as `<number><unit>`
  where unit ∈ {m,h,d}; invalid tokens throw.

### Scheduler wiring
- `lib/srs.ts`: keep a module-level default scheduler. `applyReview` gains an
  optional trailing `scheduler: FSRS` arg defaulting to the default one, so all
  existing callers/tests keep working unchanged.
- `lib/reviews.ts`: `updateReviewsForResults` reads settings once, builds a
  single `fsrs(toGeneratorParameters(settings))` instance, and passes it to
  every `applyReview` call.
- **Going-forward only:** saving settings does NOT recompute stored due dates.
  Each card picks up new params on its next review.

### API — `app/api/settings/route.ts`
- `export const dynamic = "force-dynamic"`.
- `GET` → current `FsrsSettings` (defaults if none stored).
- `PUT` → validate body ranges (`request_retention` 0.70–0.97,
  `maximum_interval` ≥ 1, steps parse-able), persist, return saved settings.
  Invalid → `Response.json({ error }, { status: 400 })`.

### Preview engine — `lib/fsrs-preview.ts` (pure, unit-tested)
- `projectPath(params, ratings, reps)` → `{ rep, intervalDays, dueAt, state }[]`
  for a chosen rating sequence (repeats the last rating if `reps` exceeds the
  sequence length). Uses `fsrs(params).next` starting from `createEmptyCard`.
- `branchFromNew(params)` → for each of Again/Hard/Good/Easy, the next interval
  from a fresh card, using `fsrs(params).repeat`.
- Both take an already-built `params` object so the client can call them with
  unsaved form values.

### UI
- `app/settings/page.tsx` — server component, `readSettings()`, passes to view.
- `app/settings/SettingsView.tsx` — client component:
  - Form in the app's existing hand-rolled Tailwind style (plain React state,
    `useToast()` on save, skeleton while loading). **Decision:** we match the
    existing codebase (no shadcn/RHF/Zod) rather than the stack named in
    `instructions.md`, for visual/behavioral consistency with the rest of the
    app. Validation is lightweight and inline.
  - Fields: retention (number/slider 0.70–0.97), max interval (days),
    learning steps (text), relearning steps (text), enable fuzz (toggle),
    enable short-term (toggle). Save + Reset-to-defaults buttons.
  - **Live visualizer**, recomputed via `useMemo` from the *unsaved* form
    values (through `parseSteps` + `toGeneratorParameters`):
    - Projected-path Recharts line chart + table. Preset selector:
      All Good / All Easy / All Hard / Mixed (Good with an occasional Again).
    - Four-rating branch table (Again/Hard/Good/Easy next interval from new).
  - If the form values don't parse (bad steps), the visualizer shows an inline
    "fix steps to preview" message instead of crashing.
- `components/Nav.tsx` — add a "Settings" item to desktop header + mobile
  bottom bar.

## Data flow

```
form state (unsaved) ──parseSteps──▶ FsrsSettings ──toGeneratorParameters──▶ params
                                                                              │
                          ┌───────────────────────────────────────────────────┤
                          ▼                                                    ▼
                 projectPath(params,…)                               branchFromNew(params)
                          │                                                    │
                          ▼                                                    ▼
                  line chart + table                                   branch table

Save ──PUT /api/settings──▶ writeSettings ──▶ settings collection
Session finish ──POST /api/sessions──▶ updateReviewsForResults ──readSettings──▶ scheduler ──▶ reviews
```

## Error handling
- API validates ranges and step syntax; bad input → 400 with a message.
- `readSettings` always returns a complete object (merge over defaults), so the
  scheduler and UI never see a partial config.
- Visualizer guards against unparseable step text.

## Testing
- `srs.test.ts` — round-trip regression for Good and Hard reaching Review state
  with growing intervals (covers the A1 bug).
- `settings.test.ts` — defaults, merge behavior, `toGeneratorParameters`
  mapping, `parseSteps`/`formatSteps` (incl. invalid tokens).
- `fsrs-preview.test.ts` — `projectPath` Easy path is monotonically increasing;
  `branchFromNew` ordering Again ≤ Hard ≤ Good ≤ Easy on a new card.
- `reviews.test.ts` — a lower `request_retention` yields a longer interval than
  a higher one for the same review (settings actually affect scheduling).

## Files
- **Modified:** `types/index.ts`, `lib/srs.ts`, `lib/reviews.ts`, `lib/due.ts`,
  `components/Nav.tsx`.
- **Added:** `lib/settings.ts`, `lib/fsrs-preview.ts`,
  `app/api/settings/route.ts`, `app/settings/page.tsx`,
  `app/settings/SettingsView.tsx`, `lib/settings.test.ts`,
  `lib/fsrs-preview.test.ts` (+ additions to `lib/srs.test.ts`,
  `lib/reviews.test.ts`).

## Out of scope
- Raw 19-weight (`w[]`) editing.
- Local-timezone forecast bucketing.
- Recomputing existing due dates on settings change.
- FSRS parameter optimization from review history.
