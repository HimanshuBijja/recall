@AGENTS.md

# Recall — flashcard revision app

Local-first, single-user flashcard app for spaced revision. Built on
Next.js 16 App Router + React 19 + Tailwind v4. Data lives in flat JSON
files at `/data` so the whole thing works offline and ships to Vercel as
a read-only snapshot.

Two card kinds are supported: classic **MCQ** (single answer + 3 distractors)
and **tf-sort** (a set of statements the learner sorts into True/False bins,
scored all-or-nothing). Most of the app is kind-agnostic — only the form,
session, and result views branch on `card.kind`.

## Stack

| Concern        | Choice                                |
| -------------- | ------------------------------------- |
| Framework      | Next.js 16.2.6 (App Router, Turbopack) |
| UI             | React 19 + Tailwind v4 (`@import "tailwindcss"`) |
| HTTP (client)  | Axios (`lib/api.ts`)                  |
| Charts         | Recharts                              |
| Persistence    | Flat JSON via Node `fs` (`lib/db.ts`) |
| Auth           | None — single-user, local-only        |

> **Heads-up:** AGENTS.md warns this is not the Next.js you know. Always
> check `node_modules/next/dist/docs/` before touching routing, caching,
> or params. Notably: dynamic params are `Promise<{...}>` and must be awaited.

## Directory layout

```
app/
  layout.tsx                  Root layout, nav, toasts, theme bootstrap
  page.tsx                    Dashboard
  cards/                      Card CRUD UI
    page.tsx + CardsBrowser.tsx
    new/page.tsx
    [id]/edit/page.tsx
  tags/                       Tag manager (DAG with parents)
    page.tsx + TagsManager.tsx
  groups/                     Groups manager (GroupsManager.tsx)
  bin/                        Unified bin (BinManager.tsx)
    page.tsx + BinManager.tsx
  test/                       Test flow
    setup/   (TestSetup.tsx)
    session/ (TestSession.tsx)
    result/  (ResultView.tsx)
  analytics/                  AnalyticsView.tsx
  import/                     ImportView.tsx (JSON bulk import)
  api/                        Route Handlers
    cards/route.ts                       GET, POST
    cards/[id]/route.ts                  PUT, DELETE (soft-delete to bin)
    cards/bulk/route.ts                  POST
    tags/route.ts                        GET, POST
    tags/[id]/route.ts                   PUT, DELETE (soft-delete to bin)
    groups/route.ts                      GET, POST
    groups/[id]/route.ts                 PUT, DELETE (soft-delete to bin)
    bin/route.ts                         GET (auto-purges expired)
    bin/restore/route.ts                 POST (restore from bin)
    bin/[id]/route.ts                    DELETE (permanent)
    bin/bulk-delete/route.ts             POST (bulk permanent delete)
    sessions/route.ts                    GET, POST
    sessions/stats/route.ts              GET (per-tag accuracy)

components/
  Nav.tsx                     Sticky desktop header + mobile bottom bar
  Toast.tsx                   ToastProvider + useToast()
  ThemeScript.tsx             Pre-hydration dark/light bootstrap
  Skeleton.tsx                Shimmer skeleton block
  CardForm.tsx                Card editor (create + edit)
  TagSelector.tsx             Autocomplete tag picker (defers tag creation)
  TagTree.tsx                 Collapsible DAG tree with optional search/filter
  GroupQuickLaunch.tsx        Dashboard one-click "Test group →" buttons

lib/
  db.ts                       readDb<T>(file), writeDb<T>(file, data)
  tags.ts                     flattenDag(), descendantTagIds()
  api.ts                      Pre-configured Axios instance

types/
  index.ts                    Card, Tag, BinItem, Session, SessionResult, TagStat

data/
  cards.json
  tags.json
  bin.json
  sessions.json
  groups.json
```

## Data model

All shapes are TypeScript interfaces (not classes). IDs are
`crypto.randomUUID()`.

```ts
Card       = { id, kind?: "mcq"|"tf-sort" (default "mcq"),
               question, answer, distractors[3],
               statements?: { text, isTrue }[],   // tf-sort only, ≥2 entries
               explanation, hint,
               difficulty 1-5, tags: TagId[], createdAt: ISO }
Tag        = { id, name, parents: TagId[] }            // DAG, multi-parent
Group      = { id, name, tagIds: TagId[], createdAt: ISO }
Session    = { id, tagIds, results[], score 0-100, completedAt: ISO }
SessionResult = { cardId, correct, timeTaken (ms), confidence 1|2|3 }
BinItem    = { id, kind: "tag"|"card"|"group", name, data: {…}, deletedAt: ISO }
```

- For `kind: "mcq"` (or missing/undefined — legacy data): `answer` and
  exactly 3 `distractors` are required; `statements` is unused.
- For `kind: "tf-sort"`: `statements` (≥ 2 entries) is required; `answer`
  is empty and `distractors` is `[]`. Scoring is **all-or-nothing** — the
  card's `SessionResult.correct` is `true` only when every statement
  matches its `isTrue`. There is no per-statement breakdown in the
  session record by design (keeps the existing analytics math intact).

## Persistence: `lib/db.ts`

- `readDb<T>(filename)` — sync `fs.readFileSync`, returns `[]` on missing/invalid file
- `writeDb<T>(filename, data)` — sync `fs.writeFileSync`, pretty-printed
- Initializes the file with `[]` on first access

> **Important:** Vercel's runtime filesystem is read-only. The intent is
> to edit data locally, commit, push. **Do not** design features that
> require writes at runtime in production.

## Tags as a DAG

Tags support multiple parents (one tag can sit under several). The
utilities in `lib/tags.ts` handle this:

- `flattenDag(tags)` — emits a render tree. Nodes appearing under multiple
  parents are emitted under each (marked `shared: true`); cycles are broken
  on the path being walked.
- `descendantTagIds(tags, rootIds)` — set of all tag IDs reachable downward
  from any root, used during test setup so "pick `algorithms`" pulls cards
  tagged with `sorting`, `searching`, etc.

When deleting a tag (`DELETE /api/tags/[id]`):

1. Tag is **soft-deleted** — moved to `bin.json` as a `BinItem`
2. Tag is removed from `tags.json`
3. Any tag listing it as a parent is updated
4. Any card referencing it has the ID stripped from `card.tags`
5. Any group referencing it has the ID stripped from `group.tagIds`
6. **Empty group cleanup**: any group left with zero tags is soft-deleted to the bin

When deleting a card (`DELETE /api/cards/[id]`):

1. Card is soft-deleted to `bin.json`
2. **Orphan tag cleanup**: for each tag the card referenced, if no
   remaining cards use that tag, the tag is also soft-deleted to the bin
   and stripped from other tags’ parents and from groups.
3. **Empty group cleanup**: any group left with zero tags after orphan
   tag removal is also soft-deleted to the bin.

> **Invariant:** Tags only exist while at least one card uses them.
> Groups only exist while they contain at least one tag.
> There is no standalone tag creation UI — tags are created exclusively
> through the CardForm when saving a card (create-on-save semantics).
> The `/tags` page is for browsing, editing, and deleting tags only.

Cards, tags, and groups all soft-delete to the same bin (see Bin section below).

## Groups (`/groups`)

A **Group** is a saved bundle of tag IDs — the user's pre-defined study
sets ("Frontend revision", "JS quirks", etc.). Groups are
write-on-demand and used purely as a launch shortcut: clicking "Test"
on a group navigates to `/test/session?tags=tag1,tag2,…&shuffle=true&min=1&max=5`,
which is the same URL contract any other launch point uses.

- Storage: `data/groups.json`. Type: `Group` in `types/index.ts`.
- API: `GET/POST /api/groups`, `PUT/DELETE /api/groups/[id]`.
- Page: `/groups` — list, search (by group name or tag name), create,
  edit, delete. The editor reuses `<TagTree searchable selected onToggle/>`
  for tag selection, so the row-click/✓ pattern stays uniform.
- Server-side, the page pre-computes each group's *card count* (expanding
  the tag DAG with `descendantTagIds` and matching cards) so the list
  can disable the Test button when nothing would actually run. Don't
  ship the full card list to the client just to recompute this.
- The dashboard renders a `<GroupQuickLaunch>` panel showing up to 6
  groups as one-click buttons that fire the same `/test/session?tags=…`
  URL. Add new entry points here if you want, but they should all use
  the same query-param contract — there is no group-aware endpoint.
- Tag deletion cascades into `groups.json` (see above). Groups never
  hold orphaned tag IDs after a tag delete.

## Card kinds (CardForm)

`components/CardForm.tsx` opens with a small segmented control:
**Multiple choice / True-False sort**. Switching kinds swaps the body
fields entirely:

- **MCQ** shows: Question · Correct answer · 3 Distractors (validated as
  exactly 3 filled).
- **tf-sort** shows: Question · a list of statement rows, each with a
  `T`/`F` pill toggle, a text input, and a remove button. There's an
  `+ Add statement` button; the form enforces a minimum of 2 filled
  statements (matching the API).

The submit handler builds the payload based on `kind`: MCQ-only fields
are empty/zero-length when kind is `tf-sort`, and vice versa. This is
the contract `app/api/cards/*` validates against, so don't loosen it
client-side without updating the route handlers too.

> **Why no per-statement edit mode in `/test/session`:** the session is
> for *answering*, not authoring. Statement edits happen in CardForm
> (or in the import preview — see below). If a learner spots a typo
> mid-test there's an "edit card →" link on the result page.

## Tag selection UX (CardForm)

The tag picker in `components/TagSelector.tsx` follows
**create-on-save** semantics — critical to keep the tag namespace clean:

- Picking an existing tag from the dropdown adds its id to `value.existing`.
- Choosing `+ Create "foo"` (or pressing Enter when no exact match exists)
  pushes the *name* onto `value.pending` and renders a green "new" chip.
- The parent `CardForm` is the one that POSTs to `/api/tags` for each
  pending name **only when the user saves the card**, deduping
  case-insensitively against existing tags first.

This protects against accidental typos creating ghost tags. If the user
abandons the form, no tags are persisted.

Keyboard:
- `↵` selects highlighted suggestion or creates pending tag
- `↑/↓` navigate suggestions
- `,` also commits
- `Backspace` on empty input removes the last chip (pending first, then existing)

## Form keyboard navigation (CardForm)

`Enter` advances focus to the next field across the whole card form
(`question → answer → d1 → d2 → d3 → hint → explanation → tags`). The
helper is local: `makeAdvanceOnEnter(refs)` returns per-field handlers
that call `.focus()` on the next non-null ref. The tag selector is
excluded — its own Enter handler picks suggestions instead. `Shift+Enter`
still inserts newlines in textareas.

## Tag selection UX — universal rules

Three places let you pick from the existing tag set: `/test/setup`, the
dashboard sidebar, and the `/tags` page (plus `/analytics` and `/cards`
which have their own custom rows). They all follow the same conventions:

- **Row click is the primary action.** No checkboxes. A green
  ✓ tile + indigo highlight + bold name shows selection. Enter and
  Space toggle when the row is focused.
- **Search + filter chips** are baked into `TagTree` via the
  `searchable` prop. When the query is non-empty or a filter
  (`All / Selected / Unselected`) is active, the tree collapses to a
  flat alphabetical list. Clear both to return to the DAG view.
- **Inline action buttons** (edit/delete on the tags page, "Test" on the
  analytics page) sit on the right and must `e.stopPropagation()` so
  clicking them doesn't also toggle the row.
- Click-target chevrons used for expand/collapse must also stop
  propagation for the same reason.

This row-as-button pattern is duplicated in `TagTree`, `TagsManager`,
and the analytics TagRow. If you add a fourth, copy the pattern — don't
invent a new one.

## Tag manager (`/tags`)

- Same row-click selection as above.
- **Select All / Deselect All** button in the header — selects all visible
  tags (respects the current search filter).
- Selection enables a "Delete N selected" action with a single confirm.
- Hover reveals inline ✎/✕ icons; the ✕ confirm prompt only appears when
  the tag is actually used by cards (a usage-count badge shows live).
- Search filter switches the tree view into a flat alphabetical list.
- **No standalone tag creation form.** Tags are created only through
  CardForm’s create-on-save flow.

## Cards (`/cards`)

- **Select All / Deselect All** button in the header — selects all visible
  cards (respects search, tag, and difficulty filters).
- Click a card to toggle selection (checkbox + ring highlight). Edit and
  Delete links use `stopPropagation`.
- Bulk delete sends individual DELETE requests per card (which triggers
  orphan tag cleanup server-side).

## Groups (`/groups`) — Select All

- **Select All / Deselect All** button in the header — selects all visible
  groups (respects search filter).
- Click a group card to toggle selection. Test/Edit/Delete buttons use
  `stopPropagation`.
- Bulk delete sends individual DELETE requests per group.

## Bin (`/bin`)

All delete operations across the app (tags, cards, groups) are **soft
deletes**. Deleted items are moved to `data/bin.json` as `BinItem`
objects and auto-purged 30 days after `deletedAt`.

- **Storage**: `data/bin.json`. Type: `BinItem` in `types/index.ts`.
  Each item stores `kind` ("tag"|"card"|"group"), a display `name`,
  the full original `data` object, and `deletedAt`.
- **API**:
  - `GET /api/bin` — returns all non-expired items, auto-purges expired.
  - `POST /api/bin/restore` with `{ ids }` — moves items back to their
    original data files based on `kind`.
  - `DELETE /api/bin/[id]` — permanent delete of a single item.
  - `POST /api/bin/bulk-delete` with `{ ids }` — permanent bulk delete.
- **Page**: `/bin` — BinManager.tsx with filter chips (All / Tag / Card /
  Group), search, Select All, Restore, Delete Forever, Empty Bin.
  Same row-click selection pattern as the tag manager.
- **Nav**: Bin appears as the last item in both desktop header and mobile
  bottom nav.

## Test flow

1. `/test/setup` — pick tags from the DAG, choose shuffle/timed/difficulty range.
2. `/test/session` reads the params:
   - `?tags=id1,id2&shuffle=true&min=1&max=5` (general)
   - `?retry=1` (reads `sessionStorage.retryCards` set by the Result page)
   - Skipping setup entirely and linking directly to `/test/session?tags=…`
     is the standard way the Analytics page launches a quiz on a subset.
3. After answering each card the user rates confidence (1/2/3); the
   timestamp delta is stored as `timeTaken`.
4. On finish, `POST /api/sessions` saves the record, then a snapshot
   `{ session, cards, tags }` is stashed in `sessionStorage` under
   `lastSession` and the user is sent to `/test/result`.

**Keyboard shortcuts during a session — MCQ card:**
- `1–4` pick the option in that position
- `H` toggle hint
- `S` skip (counts as wrong, low confidence)
- After answering: `1/2/3` set confidence and advance

**Keyboard shortcuts during a session — tf-sort card:**
The session tracks a `tfFocus` cursor (display index into the shuffled
statement order). The currently-focused row gets an indigo ring.
- `T` / `1` / `←` assign True to the focused statement and advance focus
- `F` / `2` / `→` assign False and advance focus
- `↑` / `↓` (or `k` / `j`) move focus without assigning
- `Enter` submit (only when every statement has been assigned)
- `S` submit anyway (matches MCQ's skip semantics)
- `H` toggle hint
- After submitting: `1/2/3` set confidence and advance

Clicking a statement row also moves focus there, so mouse + keyboard
can be mixed freely. A post-submit wrong-bin pill renders **grey**
(zinc), not red — only the correct bin is emerald — so it's instantly
readable as "your answer didn't match" without competing with the
green correct marker.

`beforeunload` is wired to warn if you nav away mid-session.

### tf-sort scoring (the only invariant that matters)

`recordAndAdvance(conf, "", overrideCorrect)` accepts an optional
`overrideCorrect` flag. For MCQ it's omitted and correctness is derived
from `picked === card.answer`. For tf-sort it's passed `tfAllCorrect`
(every assignment matches `statement.isTrue`). This keeps
`SessionResult.correct` a single boolean across kinds — analytics,
retry-missed, weak-tags etc. all keep working without branching.

## Analytics (`/analytics`)

Reads `sessions.json`, `cards.json`, `tags.json` server-side and hands
everything to `AnalyticsView.tsx`.

### The metric model — read this before changing math

Accuracy metrics use **the latest attempt per card**, not lifetime
averages. This is the single most load-bearing invariant on this page.
If you retry a card you previously got wrong and now get it right, every
accuracy number in this app must go up — that's the whole point of
retries.

The relevant computations:

| Metric                       | Uses                  | Why                                 |
| ---------------------------- | --------------------- | ----------------------------------- |
| Overall accuracy, "Cards seen" | `latestPerCard`     | reflects current understanding      |
| Tag accuracy, avg time, bands | `latestPerCard`      | "what do I know **now**"            |
| Accuracy by difficulty       | `latestPerCard`       | same                                |
| Confidence calibration       | all attempts          | each answer has its own confidence  |
| Total time invested          | all attempts          | the time really was spent           |
| Best score, accuracy trend   | per-session `score`   | session-level history is what shows progress |

**Trend** (used by the Regressing band and the ▲/▼ row badges) is a
per-card latest-vs-prior comparison: for every card with ≥2 attempts in
the time range, compare its latest result with the attempt immediately
before it (+1 improved, 0 same, −1 regressed). Average across cards in
the tag, multiply by 100, round. So a "Regressing" tag is one where you
genuinely did worse on the most recent retry than the one before — not
a noisy session-level diff.

`cardHistory` (map of `cardId → sorted results`) is the single source
the metrics derive from. Adding a new metric? Almost always start there.

### What the page renders

- Time-range tabs: 7d / 30d / all
- Stat cards: sessions, **cards seen** (with optional "N attempts" hint),
  accuracy ("latest per card"), best score, avg time
- Charts: accuracy trend (line, per session), accuracy by difficulty
  (bar, latest-per-card), confidence calibration (bar, all attempts),
  total time invested
- **Study groups** — auto-clustered tag buckets, each with "Test all →":
  - **Critical**          accuracy < 50%
  - **Regressing**        latest worse than previous on retried cards
  - **Shaky**             50–74%
  - **Low coverage**      < 3 cards attempted
  - **Slow but accurate** avg ≥ 10s and ≥75% accuracy
- **Tag performance table** — search + filter chips
  (All / Critical / Shaky / Solid / Low coverage / Slow / Regressing / Untested).
  Click-to-toggle rows. Each row shows accuracy bar, trend badge
  (▲/▼ ±%), `correct/total (N att)`, avg time. Action bar offers
  "Select all visible", "Clear", and "Test selected →" which routes
  straight to `/test/session?tags=…`, skipping the setup screen.

Same latest-per-card logic is duplicated on the **dashboard** (`app/page.tsx`)
for the weak-tags sidebar. If you generalize either, lift the
`cardHistory` build into `lib/`.

## Result page

Snapshot fields (`{ session, cards, tags }`) are pulled from
`sessionStorage.lastSession`. The per-tag breakdown joins `tagId →
tagById.get(id).name`, **never** display raw IDs. Missed-card rows
show: question, the correct view (see below), explanation, tag chips,
time taken, and a direct edit link.

For an MCQ miss the row shows `Correct: <answer>`. For a tf-sort miss
it instead lists every statement with a `T` or `F` chip indicating its
*real* truth value, so the learner can see which statements they
sorted the wrong way. The per-statement assignments they actually made
are **not** displayed — `SessionResult` doesn't store them (see the
tf-sort scoring invariant above).

## Import / export round-trip

`lib/export.ts` emits `kind` and `statements` on every card, and the
bulk import API (`app/api/import/route.ts`) reads them back, so a full
bundle export → import preserves card kinds and statements exactly.
`ExportedCard` carries `kind?: CardKind` plus an optional `statements`
array; for MCQ cards the statements field is omitted (keeps exports
small and obviously MCQ-shaped). Tag-name → tag-ID resolution still
happens by lowercase name match.

## Import view (`/import`)

The import view is the most opinionated screen in the app. Three things
to know before changing it:

### Schema/prompt copy is a dropdown, not a single button
`SCHEMA_OPTIONS` and `PROMPT_OPTIONS` (top of `ImportView.tsx`) drive
two split-button menus in the toolbar:

- **Schema ▾** copies one of: single MCQ card, single tf-sort card,
  mixed array (one of each), or full bundle (`{cards, tags, groups}`).
  The bundle variant is the literal export shape, so users can round-
  trip exports. Hovering or focusing a menu item also updates the live
  `<pre>` preview pill row below the toolbar.
- **AI prompt ▾** copies one of: MCQ generator prompt or tf-sort
  generator prompt. Each prompt embeds its matching example card as
  the few-shot demonstration.

When adding a new schema variant: add to `SCHEMA_OPTIONS`, make sure
the textarea validator (`validateCard`) and the API import route both
already accept its shape. The validator branches on `kind` — keep
those branches in sync with the API.

### Paste box is dynamic and accepts everything

The textarea auto-resizes to fit pasted content (no upper cap; min
180px). The toolbar inside the box has `Paste` (clipboard read),
`Format` (`JSON.parse → stringify(_, null, 2)`), and `Clear` actions.
`Tab` inserts 2 spaces instead of escaping the field.

A single paste can mix card kinds freely — the validator inspects each
card's `kind` and applies the right rule set. Pasting a card array,
a `{cards, tags, groups}` bundle, or anything in between all works
through the same `parseBundle` codepath.

### Cards preview is editable
Once JSON parses, each card renders as a row with a kind badge (`MCQ`
/ `T/F`), question summary, tag chips, and errors. Each row has:

- A ▸ chevron that expands an inline editor.
- A trash button at the row level (deletes that card from the paste —
  mutates the JSON via `mutateCards` and re-serializes the text).

The inline editor branches on kind:

- **MCQ:** editable question + answer, distractors read-only.
- **tf-sort:** editable question, plus a statement list. Each statement
  row has, left-to-right: a clickable `T`/`F` pill (toggles `isTrue`),
  an editable text input, a `✓` keeper mark, and a `✕` delete button.
  Hovering ✓ tints the row strong emerald + indigo ring; hovering ✕
  tints it strong rose. (Both use `ring-2` so they win over the soft
  marked-row tint.)

**Keeper marks are UI-only.** They live in `marked: Set<"cardIdx:sIdx">`
component state. They never persist into the imported JSON — they're
a triage tool so the user can mark statements they've already approved
as "kept" and hide them via the per-card "Hide kept" toggle, leaving
only the still-to-review statements visible. Marked statements render
in a separate **Kept (N)** section at the top of the list (with a
dashed emerald frame); the rest sit under **To review (N)** below.
Order in the underlying JSON does **not** change — the split is purely
visual.

When a statement is deleted, `shiftMarksOnStatementDelete` re-keys the
mark set so indices above the deletion shift down. When a *card* is
deleted, `clearMarksForCard` wipes all marks for that card. Don't
re-introduce index drift without re-implementing these shifters.

All edits flow through `mutateCards(fn)`, which `JSON.parse` → mutates
the parsed value in place → `JSON.stringify(_, null, 2)` back into the
textarea. The text remains the single source of truth for what gets
imported.

## Theming

- Tailwind v4 `@variant dark (&:where(.dark, .dark *))` toggle in `globals.css`
- `<html class="dark">` is set by `components/ThemeScript.tsx` *before*
  hydration to avoid a flash. Preference persisted under
  `localStorage.theme`. Nav has a manual toggle.

## Mobile layout conventions

This is a phone-first app — every screen needs to be usable on a 360px
viewport. The conventions are codified in a few places; copy them when
adding pages, don't reinvent.

**Chrome and safe areas**
- `app/layout.tsx` `<main>` uses
  `pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-6` so content
  clears the fixed mobile bottom nav plus the iOS home indicator.
- The mobile bottom nav (`<sm` breakpoint) is `fixed inset-x-0 bottom-0`
  with `pb-[env(safe-area-inset-bottom)]`, links at `min-h-[44px]` to
  meet the 44pt tap-target rule.
- Toasts use `bottom-[calc(5rem+env(safe-area-inset-bottom))] sm:bottom-6`
  with `left-4 right-4 sm:left-auto sm:max-w-sm` so they're full-width
  on phone and right-anchored on desktop. They're `pointer-events-none`
  on the wrapper with `[&>*]:pointer-events-auto` so taps pass through
  the gutter.

**Two-column pages (dashboard, tags, test setup)**
The pattern is `grid lg:grid-cols-[Xrem_Yfr] gap-6` with `order-2`/
`order-1` swaps so the *main content shows first on mobile*. Sidebars
go below the fold on small screens — never make a user scroll past a
filter panel to reach their stats.

**Sticky CTAs on small screens**
When a page has a primary action that lives in a side panel on desktop
(e.g. test setup's "Start"), render the panel `hidden lg:block` and
add a `lg:hidden fixed inset-x-0 bottom-[calc(2.75rem+env(safe-area-inset-bottom))]`
bar above the bottom nav. Don't try to share one button between the
two layouts — the contexts are different enough that two simple
renderings beat one complex one.

**Stat grids**
Always step `grid-cols-2 sm:grid-cols-N lg:grid-cols-M`. A 5-card row
should be `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` (3+2 on tablet,
2+2+1 on phone) — never leave a row with an orphan card.

**Headers with action buttons**
On small screens, header rows with an action button frequently overflow.
Use `flex flex-wrap items-center justify-between gap-3` and put
`text-sm whitespace-nowrap` on the action button. For toolbars with
multiple copy-style buttons, stack them on mobile via
`flex-col sm:flex-row`, and make each button `flex-1 sm:flex-initial`
so they fill the row width on phone.

**Test session specifically**
- Question card uses `p-4 sm:p-6`, heading `text-base sm:text-xl` —
  16px text is the iOS tap-zoom threshold so don't go below it for
  primary content.
- Top counter row uses `flex-wrap` because the timer can push the score
  chips to a second line on very narrow screens.
- Option buttons stack `grid sm:grid-cols-2` — one column on phone.

## API conventions

- Route Handlers in `app/api/*/route.ts`, **export `dynamic = "force-dynamic"`**
  on any read-heavy page using `readDb` so dev-time prerender doesn't
  cache stale data.
- Dynamic params on Next.js 16 are awaited promises:
  `ctx: { params: Promise<{ id: string }> }` → `const { id } = await ctx.params;`
- Reads: `readDb<T>(file)`. Writes: read → mutate → `writeDb(file, next)`.
- Client calls: use the `api` axios instance from `lib/api.ts` (auto
  `baseURL: "/api"`).
- Always return JSON via `Response.json(...)`. Errors use
  `Response.json({ error }, { status })`.

## Conventions I follow

- TypeScript interfaces (no classes) for data shapes; co-located in `types/index.ts`.
- One Tailwind utility chain; no CSS-in-JS or component libraries.
- Toasts on every mutation: success/error via `useToast()`.
- Skeleton blocks (not spinners) for loading.
- Mobile responsive: header collapses to bottom nav under `sm:`.
- No comments unless WHY is non-obvious. Don't describe what; describe
  the constraint or invariant.

## Common tasks

- **Add a new API field on Card:** update `types/index.ts`, add it to the
  `POST /api/cards` body construction, the `PUT /api/cards/[id]` merge,
  the `CardForm` UI (likely branched by `kind`), the import API
  (`app/api/import/route.ts`), the import view validator
  (`validateCard` in `ImportView.tsx`), and `lib/export.ts` so
  round-trips preserve it.
- **Add a new card kind:** extend `CardKind` in `types/index.ts`; teach
  the cards API routes (POST validation, PUT normalization), CardForm
  (segmented control + branched body), TestSession (prepared-card
  derivation, answered/correctness logic, keyboard handler, JSX
  branch), Result view (missed-row rendering), CardsBrowser (badge
  + summary line), and the import/export round-trip. Keep
  `SessionResult.correct` a single boolean — derive it however the
  kind requires.
- **Add a new analytics metric:** derive it inside `AnalyticsView` from
  `allResults` / `cardById` / `tagById`. Add a `<ChartCard>` or row.
- **Launch a quiz from a new entry point:** push the user to
  `/test/session?tags=ID,ID&shuffle=true&min=1&max=5`. Setup is optional.
- **Bulk-load cards:** paste a JSON array (MCQ, tf-sort, or mixed) or a
  full bundle into `/import`. Tag names match case-insensitively against
  existing tags; missing names are created.

## Env

`.env.local.example` has `APP_PASSWORD` / `SESSION_SECRET` placeholders
left over from the auth-enabled spec. They're unused — auth was scoped
out for the single-user local case. Don't add an auth dependency
without re-reading the deployment story (Vercel read-only FS).

## Scripts

```
npm run dev     # Turbopack dev server
npm run build   # Production build (types are checked here)
npm run start   # Production server
npm run lint
```

Use `npx tsc --noEmit` for a pure typecheck without spinning up Next.
