# Performance spec: instant interactions

## Problem

Clicking almost anything in the planner (checking off a task, changing a
priority, dragging a card on the board) takes a visible beat — often close to
a second — before the UI reflects it. Two independent causes stack on top of
each other:

### 1. Every request pays for an extra network round trip to Supabase Auth

`middleware.ts` calls `supabase.auth.getUser()` on every request that isn't a
static asset. `getUser()` is documented by Supabase as making a live network
call to the Auth server to revalidate the JWT — it never trusts the cookie
alone. `getSessionUser()` (`src/server/queries/wedding.ts`), which the
`(planner)` layout and several server actions call, does the same thing
again. So a single click that triggers a server action followed by a
`router.refresh()` pays for **two separate Auth-server round trips** before
any wedding data is even queried, on top of the round trips for the mutation
and the refetch itself.

Supabase's newer `getClaims()` verifies the JWT locally against the
project's cached JWKS (falling back to `getUser()` automatically for legacy
HS256 projects), so it costs no network call at all in the common case. This
is now Supabase's recommended replacement for `getUser()` in SSR
middleware/session helpers.

### 2. Mutations wait for a full server re-render instead of updating locally

Most interactive rows (`ItemRow`, `BoardView`, drag-reorder in
`ListDetail`) call a server action and then `router.refresh()`, which
re-runs every server component on the current route (layout + page +
queries) before React reconciles anything. For fields that only affect how
that one row renders — priority, due date, assignee, drag position, board
column — nothing else on the page depends on the fresh data, so the refresh
is pure latency with no visible benefit. `checked` and `flagged` already
avoid this by keeping optimistic local state and skipping (or not needing)
the refresh; the other fields don't.

## Goal

Clicking a control updates the screen immediately (optimistic, <16ms), and
network work happens in the background without blocking the visual update.
Where a full data refresh is genuinely required (an item is added, removed,
or moves between sections), only that path refreshes.

## Design

### A. Cut the duplicate Auth network round trip

- `updateSession` (`src/lib/supabase/middleware.ts`): replace
  `supabase.auth.getUser()` with `supabase.auth.getClaims()`.
- `getSessionUser` (`src/server/queries/wedding.ts`): same swap, mapping the
  decoded claims (`sub`, `email`) to the `{ id, email }` shape callers
  already use.
- Behavior for callers is unchanged (same `{ id, email } | null` shape);
  security posture is unchanged (still an asymmetric-signature-verified —
  or Auth-server-verified, for HS256 projects — identity, never a
  blindly-trusted cookie decode).

### B. Make row-level edits optimistic and stop refreshing for them

- `ItemRow` (`src/components/lists/item-row.tsx`): extend the existing
  optimistic-state pattern (already used for `checked`/`flagged`) to
  priority, due date, and assignee. Drop the `router.refresh()` call in
  each of those handlers — nothing else on the page reads those fields, so
  there is nothing to resync.
- `BoardView` (`src/components/lists/board-view.tsx`): hold the item list
  in local state seeded from props, move the dragged card to the target
  column's status immediately on drop, and drop the `router.refresh()`
  after the background `setStatus` call.
- `SectionGroup` drag-reorder (`src/components/lists/list-detail.tsx`):
  already keeps the new order in local state after a drop; the trailing
  `router.refresh()` was re-fetching data the UI doesn't use (sort order
  isn't re-derived from props after the first render), so it's removed.
- Structural mutations that change *which* items exist on the page (delete,
  add sub-item, add section, archive) keep `router.refresh()` — those need
  real server data.

## Round 2: navigation and search feedback

After round 1, item-level edits are instant, but two things still made the
app feel laggy:

### C. No navigation loading state anywhere

There was no `loading.tsx` in the app. Without one, Next.js shows nothing
at all while a route's server component data resolves — the screen just
sits frozen after a click. Added `src/app/(planner)/loading.tsx`: it wraps
`{children}` of the planner layout in a Suspense boundary, so a lightweight
skeleton appears immediately on any planner navigation (guests, lists,
board, invitations, etc.) while the destination's data loads, instead of an
unresponsive-looking pause. The header/nav aren't part of that boundary, so
they stay put across navigations.

### D. The guest search box re-queried on every keystroke

`FilterBar`'s search input called `router.replace()` — a real navigation
that re-runs `requireWedding()` + `listGuests()` + `getTags()` +
`getEvents()` and re-renders the whole `/guests` page — directly from
`onChange`, with no debounce. Typing a five-letter name fired five full
round trips. Added a 300ms debounce before the search term updates the URL;
the other filters (selects) are unchanged since picking a dropdown option
is already a single discrete action, not a per-keystroke one.

## Out of scope (candidates for a follow-up increment)

- Making add/delete/section mutations fully optimistic via `useOptimistic`
  instead of `router.refresh()`.
- Auditing `router.refresh()` usage in guest/household/import/questions/
  events forms — not part of the "click to change" complaint, left as-is
  here to keep this change reviewable.
- Supabase query shape (N+1s, missing indexes) — not implicated by the
  reported symptom, worth a separate pass if it resurfaces after this fix.

## Verification

- `npm run typecheck`
- `npm run test`
- Manual: toggle status/priority/date/assignee on `/lists/[id]` and `/board`,
  drag a card between board columns, drag-reorder items in a list — each
  should visually update on the same frame as the click/drop, with no
  full-page flash.

---

# Round 3: navigation, not interaction

## Problem

Rounds 1 and 2 made *clicking a control* instant. The complaint that
followed was a different one: **navigating between pages** takes around
three seconds — click "Guests", wait, click "Budget", wait again.

Rounds 1 and 2 could not have fixed this, because none of it is on the
interaction path. This round is the pass that round 1's "out of scope"
list parked: *"Supabase query shape (N+1s, missing indexes) — worth a
separate pass if it resurfaces."* It resurfaced.

Five causes, in descending order of how much they cost:

### 1. Every query crossed the Atlantic, twice

The Supabase project is in **eu-west-1** (Ireland). `vercel.json` set no
`regions`, so Vercel put the serverless functions in its default, **iad1**
(Washington DC). Every single Supabase round trip therefore went Ireland
↔ Virginia: roughly 75–90ms each, before Postgres did any work at all.

A page that issues eight queries pays over half a second in pure network
latency on that geography alone, and any query that has to *wait* for an
earlier one multiplies it. This is the single largest contributor, and it
is a one-line fix — but it is invisible from the code, which is why four
rounds of reading server components never turned it up.

`"regions": ["dub1"]` puts the functions in Dublin, the same region as the
database. That collapses each of those round trips from ~80ms to ~5ms, and
as a bonus shortens the user's own leg too: a UK couple currently reaches
Virginia and comes back.

**If the database is ever moved, this value has to move with it.**
`vercel.json` is strict JSON and cannot carry a comment saying so, which is
why it is written down here. `dub1` is Vercel's name for eu-west-1.

### 2. `/budget` issued three queries per budget line

`getBudgetItemLinks(weddingId, itemId)` was called once per budget item,
and each call made up to three round trips. Forty lines meant up to 120
queries to paint one page. `Promise.all` did not rescue it — they still
queue through the same PostgREST connection, so the page waited for all of
them.

Worse, one of the three reads `v_budget_item_tasks`, which is a `union
all` of two sources wrapped in a `group by`. The `linked_via_list` filter
lands on an aggregate, so it cannot use an index, and the whole view was
re-aggregated on every one of those calls.

Replaced with `getBudgetItemLinksForItems(weddingId, budgetItemIds)`:
three queries for the entire page, regardless of how many budget lines
there are. Scoped by the wedding's own budget item ids rather than a
`wedding_id` filter because the view does not project that column; it is
`security_invoker`, so RLS remains the tenancy boundary either way.

### 3. Serial round trips that had no dependency to justify them

Several pages awaited things one after another that did not need each
other:

- **`/budget`** fetched guest counts, *then* FX rates, *then* links — three
  sequential waits, none of which depends on the other two. Now one
  concurrent batch.
- **`/timeline`** and **`/lists/[id]`** fetched items, *then* the budget
  badges for those item ids, *then* the labels. The badge lookup is now
  available scoped by **list** (`getBudgetLinksForLists`) as well as by
  item. `v_budget_item_tasks` carries `list_id`, and every list item
  belongs to exactly one list, so it is the same set of rows — but the
  list ids are known up front (from the URL on `/lists/[id]`, from
  `getLists` on `/timeline`), so it runs *alongside* the items instead of
  after them. `v_timeline_items` and `getLists` share the same
  `archived_at is null` filter, so the scopes match exactly.
- **`/lists`** awaited its batch and *then* fetched the view's items. Only
  the "mine" view needs the signed-in user first; the other four were
  paying a serial round trip for a dependency they never had.

### 4. `getActiveListIds` was an uncached query in front of six others

Every smart view (`today`, `scheduled`, `flagged`, `all`, `mine`, plus
`/board`) awaited `getActiveListIds` *before* it could build its own
query — a strict serial round trip in front of each one. It was a bare
`async function`, not a `cache()`d one, so a page showing two views, or
`/budget` (which calls both `getLists` and `getAllItems`), paid for it
again each time.

It now derives from the already-cached `getLists` — same wedding, same
`archived_at is null` filter, same set — so it collapses to a single
`lists` query per render, usually one the page has already made for its
sidebar.

### 5. The client router cache was off

Every planner page reads cookies, so Next treats all of them as dynamic,
and `experimental.staleTimes.dynamic` defaults to **0**. A page visited two
seconds ago was re-fetched and fully re-queried on the way back to it.
Nothing in this app is cached anywhere else, so that default meant *every*
repeat navigation paid full price.

Set to 30s. That is safe rather than arbitrary: every mutation here goes
through a Server Action calling `revalidatePath` and/or `router.refresh()`,
both of which drop these entries immediately, so your own edits are never
stale. The only thing the window can delay is the *other* collaborator's
edit appearing on a page you are bouncing back to — the right trade for a
two-person planner.

## Out of scope (still)

- **`/budget` ships every task in the app to the browser.** `allTasks` is
  passed to every `BudgetItemRow` purely to populate the "Link a task…"
  search inside a popup that is usually closed. React's Flight serializer
  dedupes it by reference so it crosses the wire once, not once per row,
  but it is still a payload nobody asked for on most loads. Wants to be
  fetched when the popup opens.
- **Streaming.** Pages still block on all of their data before rendering
  anything; `loading.tsx` covers the wait with a skeleton, but the wait is
  still the sum of the queries. Per-section `Suspense` boundaries would let
  the shell paint first.
- **Indexes.** Checked and found adequate for these access paths — the
  composite primary keys on `budget_item_tasks` and `budget_item_lists`
  already cover the `budget_item_id` lookups. No migration in this round.

## Verification

- `npm run typecheck`
- `npm run test` (220 tests)
- `npm run build`
- Manual, after deploying: navigate between Overview, Guests, Budget,
  Lists, Timeline and Board. First visit to each should be well under a
  second; clicking *back* to one visited in the last 30s should be
  immediate. `/budget` with a realistic number of lines is the page to
  watch — it was the worst of them.
