# Feature spec: The Today view shows overdue tasks

**Status: proposed, not built.** A spec only — nothing in this document is
implemented, and its open questions (§5) are the planner's to answer before
any code is written.

**Depends on:** Spec 1 (lists, `list_items.due_date`/`status`), spec 2
(reminders — `buildDigest`'s definition of "overdue", `snoozed_until`),
spec 3 (`/lists` smart views). All already built.

## 1. The problem

`/lists?view=today` ("Today" in the Tasks sidebar, and the default view)
shows only items whose `due_date` is **exactly today**
(`getTodayItems` in `src/server/queries/lists.ts`: `.eq("due_date",
todayIso())`, not done, active lists). The moment a task's due date passes
without it being ticked off, it drops out of Today the next morning. It is
not gone — but nothing on Today says it exists.

Where an overdue task can be seen today, and why that isn't enough:

- **Dashboard "Overdue" tile** (`src/app/(planner)/page.tsx`) — shows a
  *count* only, built from `getTimelineSummary`. It says "3 past their due
  date" and doesn't say which three.
- **Scheduled** (`/lists?view=scheduled`) — every dated, not-done item,
  oldest first, so overdue items *are* technically at the top. But nothing
  marks them as overdue (no label, no colour — `item-row.tsx` has no overdue
  styling), they sit mixed in with items due months from now, and it isn't
  the view anyone opens to ask "what do I need to do today?".
- **The weekly digest email** lists them, but that's once a week, outbound
  only.

So the planner's reading — "there's no way to see what's overdue" — is
right in the way that matters: no screen answers *"what have I missed?"*
at a glance. Today is the natural home: it's the default view, and a task
that was due yesterday is more urgent than one due today, not less.

## 2. What this changes

`/lists?view=today` gains an **Overdue** group above today's items:

- **Overdue** — every not-done item, in an active list, with
  `due_date < today`, **oldest first** (most overdue at the top). Each row
  shows how late it is ("3 days overdue") next to its existing due-date
  display, in the same warning tone the dashboard's overdue tile already
  uses (`tone="bad"`).
- **Due today** — exactly what Today shows now, unchanged, beneath it.

The two are separate groups with their own small headings rather than one
merged list, so a long overdue backlog can't bury what's actually due
today, and the planner can tell the two apart without reading dates. When
there are no overdue items the Overdue group isn't rendered at all — Today
looks exactly as it does now.

**The empty state changes.** Today's "Nothing due today." copy only shows
when *both* groups are empty. If only overdue items exist, the page shows
the Overdue group and a quiet "Nothing else due today." line under it, so
a screen with items on it never reads as empty.

**Rows are the same `ItemRow`** as everywhere else: tick done, snooze,
reassign, flag, open the list — all the actions already on a smart-view
row work on an overdue item with no new code. Ticking an overdue item done
removes it from the view the way ticking a today item does.

### 2a. The shared definition of "overdue"

`buildDigest` (`src/lib/reminders/digest.ts`) is already the one place that
decides what's overdue: `due_date < today`, not done, and not snoozed past
today. The dashboard tile and the digest email both go through it, so they
can never disagree (see the comment on `getTimelineSummary`). This feature
must not introduce a third, slightly different definition. The overdue
query below is therefore specified to match `buildDigest`'s rules exactly
(§5 question 2 is the one place the planner can choose otherwise).

### 2b. Out of scope

- **Overdue payments.** `v_reminders_due` unions unpaid payment-schedule
  rows into the dashboard's overdue count (spec 6 §3). The Today view
  shows list items only, as it does now, so the dashboard's overdue
  *count* can be higher than the number of rows in Today's Overdue group.
  Showing payments here is a bigger change (they aren't `list_items` and
  don't render in `ItemRow`) and is listed as question 6 rather than
  decided.
- **Scheduled, Flagged, All, Mine.** Unchanged. (Marking overdue rows with
  the "N days overdue" label *there* too would be cheap once `ItemRow`
  supports it — see §3 — but isn't requested.)
- **The dashboard tile.** Left as a count. Making it link to
  `/lists?view=today` is a one-line follow-up, not part of this spec.
- **Timeline, Calendar, Board.** Date-driven views; they already place an
  overdue item at its own past date.
- **Any schema change.** None needed — see §3.

## 3. How it would be built (after §5 is answered)

No migration, no new table, no new view: `list_items.due_date`,
`status` and `snoozed_until` already hold everything.

1. **A pure helper in `src/lib/lists/`** — e.g. `daysOverdue(dueDate,
   today)` and an `isOverdue(item, today)` that encodes the §2a rules
   (`due_date < today`, not done, not snoozed past today). Unit-tested in
   a sibling `.test.ts`, per the repo's "pure logic lives in `src/lib/`"
   rule. Where practical `buildDigest` should call the same predicate
   rather than keep its own copy, so there is genuinely one definition.
2. **A new query** `getOverdueItems(weddingId)` in
   `src/server/queries/lists.ts`, `cache()`-wrapped, shaped like
   `getTodayItems` (same `ListItemWithList` select, same active-list
   scoping via `getActiveListIds`), filtered `.lt("due_date", todayIso())`
   and `.neq("status", "done")`, ordered by `due_date` ascending. The
   snooze rule is applied per §5 question 2.
3. **`/lists/page.tsx`** — for `view === "today"` fetch overdue alongside
   today's items in the existing `Promise.all`, so Today costs one extra
   parallel query, not a serial round trip.
4. **`SmartView`** (`src/components/lists/smart-view.tsx`) — accepts an
   optional `overdueItems` for the `today` view and renders the two groups
   (§2). `ItemRow` gets an optional "N days overdue" badge, rendered only
   where the caller passes the overdue flag, so every other view is
   untouched.
5. **Sidebar count (only if §5 question 4 says yes)** — a badge on the
   "Today" entry in `ListsSidebar`; otherwise untouched.

Tests: the helper's unit tests (past/today/future, done, snoozed,
snooze-expired, date boundary around `todayIso`), run alongside the
existing `npm run typecheck`, `npm test` and `npm run build`. As with
every spec since spec 1, nothing here would have been opened in a browser
or run against a live Supabase project unless that is actually done.

## 4. Edge cases the build has to handle

- **A very old backlog.** Importing a template or setting a wedding date
  late can make dozens of items overdue at once. The Overdue group has no
  cap by default (§5 question 5), so Today could become long; the group
  heading carries the count so the size is obvious before scrolling.
- **Items with no due date** are never overdue, and still never appear on
  Today.
- **Archived lists** are excluded, same as every other smart view
  (`getActiveListIds`).
- **Sub-items** whose parent is open: treated like any other item — each
  is a `list_items` row with its own due date and status — matching what
  Today and the digest already do. Cascading completion (spec 11) already
  closes sub-tasks when the parent is ticked.
- **"Today" is computed in UTC**, because `todayIso()` is
  `Date.UTC`-based. See §5 question 3 — this predates the feature and
  affects the existing Today query identically, but moving the overdue
  line is where it would first become visible.

## 5. Open questions for the planner

1. **Grouped, or one merged list?** *Recommendation:* two groups — Overdue
   above, Due today below (§2). The alternative is a single list sorted
   oldest-first with an "overdue" tag on the late rows, which is simpler
   but lets a long backlog push today's items off the screen.
2. **Should a snoozed item count as overdue?** The digest and dashboard
   say no — a task snoozed until Friday isn't nagging you before Friday.
   *Recommendation:* match them (hidden until the snooze expires), so the
   three places agree. The alternative is to show snoozed overdue items
   dimmed rather than hide them.
3. **What is "today"?** The existing Today query uses the UTC date, which
   for a New Zealand wedding is a day behind for roughly the first 12–13
   hours of the local day. The platform spec says dates display in the
   wedding's own timezone. *Recommendation:* fix this in the same change
   if the wedding's timezone is already on `weddings` (it needs checking
   against the code before building), since otherwise overdue tasks flip
   at midday local time. Or leave it and treat it as a separate bug.
4. **A count badge on "Today" in the sidebar?** e.g. "Today · 3 overdue".
   Cheap, but it's a second place to keep consistent. *Recommendation:*
   yes, overdue count only.
5. **Any cap or age limit on the Overdue group?** *Recommendation:* no
   cap — hiding old overdue items is the opposite of the request. If the
   backlog gets unwieldy, a "show 10 oldest, expand for the rest" fold is
   a later tweak.
6. **Overdue payments in this view?** *Recommendation:* not now (§2b) —
   they live on `/budget`, and the dashboard count can say so. Say if you
   want them in Today anyway.
7. **Mark overdue rows on Scheduled/Flagged/All/Mine too?** Not requested;
   *recommendation:* leave until asked.
