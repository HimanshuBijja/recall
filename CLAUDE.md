@AGENTS.md

# Recall — flashcard revision app

Local-first, single-user MCQ flashcard app for spaced revision. Built on
Next.js 16 App Router + React 19 + Tailwind v4. Data lives in flat JSON
files at `/data` so the whole thing works offline and ships to Vercel as
a read-only snapshot.

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
  test/                       Test flow
    setup/   (TestSetup.tsx)
    session/ (TestSession.tsx)
    result/  (ResultView.tsx)
  analytics/                  AnalyticsView.tsx
  import/                     ImportView.tsx (JSON bulk import)
  api/                        Route Handlers
    cards/route.ts                       GET, POST
    cards/[id]/route.ts                  PUT, DELETE
    cards/bulk/route.ts                  POST
    tags/route.ts                        GET, POST
    tags/[id]/route.ts                   PUT, DELETE (cascades from cards)
    sessions/route.ts                    GET, POST
    sessions/stats/route.ts              GET (per-tag accuracy)
    groups/route.ts                      GET, POST
    groups/[id]/route.ts                 PUT, DELETE

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
  index.ts                    Card, Tag, Session, SessionResult, TagStat

data/
  cards.json
  tags.json
  sessions.json
  groups.json
```

## Data model

All shapes are TypeScript interfaces (not classes). IDs are
`crypto.randomUUID()`.

```ts
Card    = { id, question, answer, distractors[3], explanation, hint,
            difficulty 1-5, tags: TagId[], createdAt: ISO }
Tag     = { id, name, parents: TagId[] }            // DAG, multi-parent
Group   = { id, name, tagIds: TagId[], createdAt: ISO }
Session = { id, tagIds, results[], score 0-100, completedAt: ISO }
SessionResult = { cardId, correct, timeTaken (ms), confidence 1|2|3 }
```

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

1. Tag is removed from `tags.json`
2. Any tag listing it as a parent is updated
3. Any card referencing it has the ID stripped from `card.tags`
4. Any group referencing it has the ID stripped from `group.tagIds`

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
- Selection enables a "Delete N selected" action with a single confirm.
- Hover reveals inline ✎/✕ icons; the ✕ confirm prompt only appears when
  the tag is actually used by cards (a usage-count badge shows live).
- Search filter switches the tree view into a flat alphabetical list.

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

**Keyboard shortcuts during a session:**
- `1–4` pick the option in that position
- `H` toggle hint
- `S` skip (counts as wrong, low confidence)
- After answering: `1/2/3` set confidence and advance

`beforeunload` is wired to warn if you nav away mid-session.

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
show: question, correct answer, explanation, tag chips, time taken,
and a direct edit link.

## Theming

- Tailwind v4 `@variant dark (&:where(.dark, .dark *))` toggle in `globals.css`
- `<html class="dark">` is set by `components/ThemeScript.tsx` *before*
  hydration to avoid a flash. Preference persisted under
  `localStorage.theme`. Nav has a manual toggle.

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
  `POST /api/cards` body construction, update `CardForm` UI, update
  bulk-import validation in `app/import/ImportView.tsx`.
- **Add a new analytics metric:** derive it inside `AnalyticsView` from
  `allResults` / `cardById` / `tagById`. Add a `<ChartCard>` or row.
- **Launch a quiz from a new entry point:** push the user to
  `/test/session?tags=ID,ID&shuffle=true&min=1&max=5`. Setup is optional.
- **Bulk-load cards:** paste a JSON array into `/import`. Tag names match
  case-insensitively against existing tags; missing names are created.

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
