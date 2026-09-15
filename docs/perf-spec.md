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
