# Analytics findings — 2026-07-24

Diagnosis pass for the "numbers wrong / charts empty" reports, done against
the current `master` (post-MongoDB-migration, post-FSRS) state of
`app/analytics/AnalyticsView.tsx` and `lib/due.ts`. Method: hand-computed
expected values for a small fixture, compared against what the code
actually returns; also reproduced with a throwaway vitest file
(`lib/due-repro.test.ts`, deleted after use) using the exact scenario
from AN3's spec.

## Confirmed defects

### 1. Forecast day-bucketing uses UTC, not the viewer's local day (→ AN3)

**Symptom:** A review due later *today* (local time) can show as due
"tomorrow" in the 14-day forecast bar chart, or disappear from both
buckets, depending on the offset between local time and UTC.

**Location:** `lib/due.ts`, `getReviewsSummary`, `getUtcDateString` (line
51-53) and the `i === 0` / else branching (lines 59-67).

**Root cause:** `getUtcDateString` calls `d.toISOString().split("T")[0]`,
which is the UTC calendar date, not the viewer's local calendar date.
`i === 0`'s count comes from `due` (a correct local-time comparison via
`now.getTime()`), but `i >= 1` buckets compare `r.dueAt`'s UTC date
string against the UTC date string of `now + i days`. When a review's
`dueAt` is later *today* in local time but has already rolled to
tomorrow's date in UTC (e.g. any US timezone, evening due times), it is
excluded from bucket 0 (already counted correctly via `due`) but then
also excluded from bucket 1 because bucket 1's target day (computed by
adding 24h to `now`, itself a local `Date`, then taking its UTC date)
doesn't line up with the review's UTC date either. Net effect verified
with a concrete repro:

```
now = local 2026-03-10T20:00:00
review.dueAt = local 2026-03-10T23:00:00 (due later today)
```

Expected: `forecast[0].count === 1` (it's due today), `forecast[1].count === 0`.
Actual (reproduced on this machine, default TZ, no override needed):
`forecast[0].count === 0`. The count silently disappears from the chart
entirely rather than double-counting — worse than the plan's forecast
description, but the same root cause and same fix (local-day bucketing).

**Fix mapping:** AN3 (local-day bucketing).

### 2. Confidence-calibration and accuracy-by-difficulty charts don't show an empty state

**Symptom:** With `range=7d` (or any filter) and zero matching sessions,
"Accuracy over time" already renders "Not enough data." (existing
`Empty` fallback keyed off `trend.length === 0`), but "Accuracy by
difficulty" and "Confidence calibration" instead render a full bar chart
with five/three 0%-height bars and zero counts, indistinguishable from
"you got everything right 0% of the time" — there's no way to tell
"no data" from "0% accuracy on real attempts."

**Location:** `app/analytics/AnalyticsView.tsx`, the `ChartCard`
instances for "Accuracy by difficulty" (byDifficulty) and "Confidence
calibration" (byConfidence) — unlike the trend chart, neither is wrapped
in an empty-state conditional.

**Root cause:** `byDifficulty` buckets are pre-seeded for all 5
difficulties and always return `{ accuracy: 0, total: 0 }` when nothing
matches, so the chart always has 5 rows to draw. Same for `byConfidence`
(3 pre-seeded buckets). No `NaN`/`-Infinity` renders (already guarded
inside each), but the chart is visually indistinguishable from real
0%-accuracy data.

**Fix mapping:** AN3, extending the same empty-state pattern already
established for the trend chart (Step 5 of the AN3 task description
covers "each `<ChartCard>` whose series is empty" generically — this
finding is folded into that same step, not a separate AN3.x task).

## Audited, no defect found

- **avgTime / totalTime split** — confirmed `avgTime` (Stat card) uses
  `latestResults` (latest-per-card) and `totalTime` uses `allResults`
  (lifetime), matching the invariant in `CLAUDE.md`.
- **Confidence calibration data source** — confirmed it iterates
  `allResults` (all attempts, not latest-per-card), matching the
  invariant. Empty buckets already render `0`, not `NaN` — the
  `buckets[k].total ? ... : 0` guard is present and correct.
- **Trend badge sign** — `▼` badge fires when `trend <= -10` (worse on
  retry), `▲` when `trend >= 10` (improved on retry). Matches spec.
- **`bestScore` `-Infinity` guard** — already fixed on this branch
  (`filteredSessions.length ? Math.max(...) : 0`), contrary to the plan
  text which described it as still-broken at `AnalyticsView.tsx:127`.
  No code change needed here; the AN3 task's step 5 is a no-op for this
  specific guard (verified via `components/__tests__/analytics-empty.test.tsx`
  instead of re-fixing).
- **`getReviewsSummary` `new`/`overdue` counts** — `overdue` intentionally
  excludes never-reviewed cards (`lastReviewedAt !== null` filter) so a
  brand-new overdue card counts as `due` but not `overdue`; this is by
  design, not a bug. `new` count is computed against reviews for all
  cards ever reviewed (not filtered to active cards first) but is only
  ever consulted through `cards.filter(c => !reviewedCardIds.has(c.id))`,
  which already restricts to active cards, so stale reviews for deleted
  cards can't leak in.

## Fix tasks spawned

- AN3 (existing, expanded scope): local-day forecast bucketing in
  `lib/due.ts` **and** empty-state guards for the difficulty + confidence
  charts (in addition to the already-present trend/bestScore guards).
  No new AN3.x task needed — both confirmed defects fit inside AN3's
  existing step list.
