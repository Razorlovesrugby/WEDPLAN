# Feature spec: Navigation regrouping — Tasks, a Guests hub, Events with its run sheet, and where Invitations lives

**Status: proposed, not built.** Five separate navigation requests that all
land on the same fourteen-entry `Nav` (`src/components/nav.tsx`) and
interact with each other — one of them (§1D vs. §1B) is a direct conflict in
what was asked for, so **nothing here should be built until §5 is
answered**, starting with question 1.

**Not to be confused with spec 11** — that spec is about editing an
individual list's own title and how tasks move within one; this spec is
about which nav entries exist and what pages they group together. Read
spec 11's header note if "rename lists to tasks" and "list names editable"
are being considered together — they're different requests answered
separately.

**Depends on:** V1 (`events`, `guests`, `households`, `invitations`,
`rsvp_questions`), spec 1 (lists/timeline/calendar/board), spec 3 (Nav's
existing mobile hamburger collapse), spec 5 part B (the run sheet, already
scoped one-per-event), spec 6 (budget). All already built. This spec adds
no new data and no new server logic anywhere except §1C's one missing link
— it is entirely about how existing screens are grouped and labelled.

## 1. What this changes

Today's `Nav` is a flat list of fourteen destinations: Overview, Guests,
Ranking, Events, Run sheet, Invitations, Questions, Lists, Timeline,
Calendar, Board, Budget, Moodboards, Settings. Four separate requests ask to
turn parts of that flat list into grouped hubs — one nav entry, several
screens underneath it — plus one asks to reorder what's left.

**The guiding constraint for all four:** every one of these routes is
linked to from somewhere else already — the dashboard's tiles link straight
to `/guests?rsvp=yes`, `/guests/rank`, `/invitations?status=sent`, and so
on (`src/app/(planner)/page.tsx`); reminder emails and RSVP flows carry
their own links; `/api/export/*` reads the same filter query strings
`/guests` does. **None of the existing URLs move.** Every regrouping below
is a new shared tab strip sitting *above* screens that keep their current
routes, props, and query-string contracts exactly as they are today — the
same relationship `PlannerLayout` already has to `Nav` itself, one level
deeper. This is what keeps four navigation changes from turning into a
"fix every link across the app" change.

### A. "Lists" becomes "Tasks," with Calendar and Board as sub-tabs

Two requests, read together: "rename lists to tasks," and "Tasks should be
one tab with subtabs of calendar & board." Both are about the four
adjacent nav entries `Lists`, `Timeline`, `Calendar`, `Board` — every one of
them is the same underlying `list_items` rows, shown four different ways.

This collapses those four into one `Nav` entry, **"Tasks"**, linking to
`/lists` (unchanged route, unchanged default landing on the "Today" smart
view). `/lists/page.tsx` gains a sub-tab strip above the sidebar +
smart-view/list-detail area, matching the shape `/guests` gets in §1B below:
**Tasks · Calendar · Board**, plus — per §5 question 2 — possibly
**Timeline** as a fourth, since the planner's wording named only calendar
and board but Timeline is the same family of screen and currently sits
right next to them in the flat nav today.

The rename itself is copy-only, scoped to what a planner reads, not what the
schema or code calls anything — same posture spec 10 and spec 7 took with
their own small UI changes:

- `Nav`'s `Lists` label → `Tasks`.
- `ListsSidebar`'s "Your lists" heading → "Your tasks" (the smart-view links
  above it — Today, Scheduled, Flagged, All, Assigned to me — are unchanged;
  none of them say "list").
- Page titles/metadata that currently say "Lists" (`/lists/page.tsx`).
- **Not renamed:** `lists`/`list_items`/`list_sections` tables, every
  action and query named after them, `ListRow`/`ListItemRow` types, the
  `kind` column's `"generic"`/`"timeline"` values, and every code comment
  that already says "list." Renaming the *storage* would touch dozens of
  files with no user-visible benefit and is explicitly out of scope — see
  §2.
- **A list itself keeps being called a list** in the product's own language
  — "Wedding Day," "Vendors," and so on are still lists, each holding
  tasks. "Tasks" is the name of the section that holds every list, the way
  "Guests" is the name of the section that holds every household — not a
  replacement noun for "list."

### B. Guests, Ranking, and Invitations become one hub

Today three flat nav entries (`Guests`, `Ranking`, `Invitations`) point at
three unrelated-looking screens that are all, in fact, about the same
question: who's coming. This groups them under one `Nav` entry, **"Guests,"**
linking to `/guests`, with a sub-tab strip above the guest table:
**Guests · Ranking · Invitations**, each tab an ordinary link to that
screen's already-existing route (`/guests`, `/guests/rank`, `/invitations`)
— not a client-side tab panel, since each of the three is its own server
page with its own data fetching. `Households` stays reachable exactly as it
is today (from a guest row, or `/households/new`) — not asked for as a
fourth tab, and folding it in isn't assumed here; see §5 question 3.

This is the one that collides with §1D below — see §5 question 1 before
reading further.

### C. Events and its run sheet, made discoverable together

The run sheet is already, technically, "individual to each event" —
`/events/[id]/run-sheet` has been scoped that way since spec 5 part B. What
isn't true today is that anything on `/events` *links* there: `EventsEditor`
(`src/components/invitations/events-editor.tsx`) lists every event with
Edit/Delete buttons and nothing else, so the only way to reach an event's
run sheet is through the separate `/run-sheet` picker
(`src/app/(planner)/run-sheet/page.tsx`), which exists purely because
`EventsEditor` doesn't link there directly.

This adds a "Run sheet →" link to each row in `EventsEditor`, going straight
to `/events/[id]/run-sheet`, and folds the standalone `Run sheet` nav entry
into `Events` — one `Nav` entry, **"Events,"** with the run sheet reached
per-event from the events list rather than through its own top-level
picker. `/run-sheet` (the picker) is redirect-only from here on: still
useful as a fallback destination if something old links straight to it
(nothing in this codebase does, per a search of `href="/run-sheet"`), so it
stays rather than being deleted, but it's no longer a `Nav` entry.

### D. Invitations and Questions, together in a tab

The other place "Invitations" was asked to land — its own tab, next to
`Questions`, since an invitation and the RSVP questions attached to it are
both about the same thing a household receives: one link, some questions on
the other end of it.

### E. Budget moves to second, right after Guests

`Nav`'s order, after the four groupings above (and however §5 question 1
resolves the B/D conflict), becomes: **Overview, Guests, Budget, Events,
[Invitations placement per §5 question 1], Tasks, Moodboards, Settings** —
Budget's new position is unambiguous regardless of how question 1 resolves,
since it only says "after Guests," not anything about Invitations' place
relative to it.

## 2. Scope

**In:**
- `Nav`'s `LINKS` array collapses from fourteen entries to roughly eight
  (exact count depends on §5's answers), reordered per §1E.
- A small shared tab-strip component (sub-tabs are plain links with
  `aria-current`, the same pattern `ListsSidebar`'s `SMART_VIEWS` already
  uses — not a new UI primitive) rendered above `/guests`, `/guests/rank`,
  `/invitations` (§1B) and above `/lists`, `/calendar`, `/board`, possibly
  `/timeline` (§1A).
- `EventsEditor`: a "Run sheet →" link per event row (§1C).
- Copy-only renames: `Nav`'s `Lists` label, `ListsSidebar`'s "Your lists"
  heading, `/lists`'s page title (§1A).
- `/run-sheet` (the picker) demoted from a `Nav` entry to an unlinked
  fallback route (§1C).

**Out:**
- **No URL changes, anywhere.** `/guests`, `/guests/rank`, `/invitations`,
  `/invitations/print`, `/events`, `/events/[id]/run-sheet`, `/questions`,
  `/lists`, `/lists/[id]`, `/timeline`, `/calendar`, `/board`, `/budget` all
  keep their current paths. Every dashboard tile, reminder email link, and
  `/api/export/*` query string keeps working with no changes to them.
- **No rename of `lists`/`list_items` or any code identifier** — §1A is
  copy-only (see that section's own scoping).
- **No merge of the underlying screens themselves.** `/guests`,
  `/guests/rank`, and `/invitations` stay three separate server components
  with their own queries — this only adds a shared tab strip above them, not
  a combined page.
- **No change to `/households`** — not folded into the Guests hub by this
  spec (§5 question 3 is where that gets decided if wanted).
- **No mobile-nav rework beyond what falls out naturally** from having
  fewer top-level entries — spec 3's existing hamburger collapse
  (`Nav`'s `sm:hidden` panel) already handles however many entries remain;
  fewer entries only makes that panel shorter, nothing about its mechanism
  changes.

## 3. Nav, before and after

| Today (14 entries) | Proposed (per §5's answers) |
| --- | --- |
| Overview | Overview |
| Guests | **Guests** (sub-tabs: Guests · Ranking · Invitations\*) |
| Ranking | **Budget** |
| Events | **Events** (run sheet reached per-event, §1C) |
| Run sheet | Invitations\* — *only if §5 Q1 answers "Questions," not "Guests"* |
| Invitations | Questions\* — *paired with Invitations per above* |
| Questions | **Tasks** (sub-tabs: Tasks · Calendar · Board\*\*) |
| Lists | Moodboards |
| Timeline | Settings |
| Calendar | |
| Board | |
| Budget | |
| Moodboards | |
| Settings | |

\* Exact placement of Invitations, and whether Questions gets folded into
the Guests hub instead of staying separate, is §5 question 1.
\*\* Whether Timeline joins as a third sub-tab is §5 question 2.

## 4. What doesn't change

- No new tables, columns, migrations, server actions, or queries anywhere
  in this spec except the one new link in `EventsEditor` (§1C), which reads
  data (`event.id`) that page already has.
- No RLS, tenancy, or auth surface touched — this is presentation only.
- `docs/specs/README.md`'s feature list gains a row for this spec; nothing
  about specs 1–12's own statuses changes.

## 5. Open questions — need the planner's answers before anything is built

1. **The direct conflict: does Invitations join the Guests hub (§1B), or
   pair with Questions (§1D)?** The planner asked for both in the same
   message, and a single nav entry can't do both — "Invitations" would need
   to appear under two different tabs simultaneously, which is confusing
   rather than convenient. Three ways to resolve it, roughly in order of how
   much they preserve of what was asked:
   - **(a) Invitations joins Guests** (§1B as written); Questions stays its
     own standalone `Nav` entry, unpaired. Loses the "Invitations and
     Questions together" request.
   - **(b) Invitations pairs with Questions** (§1D as written); the Guests
     hub becomes just Guests + Ranking, two tabs instead of three. Loses
     half of "Guests and ranking and invitations into one page."
   - **(c) Both, via a cross-link rather than shared nav placement**:
     Invitations lives under the Guests hub as its primary home (since
     that's where "who's coming" naturally sits, and where the dashboard's
     invitation tiles already point), and the Questions screen gets a
     visible link over to Invitations (and vice versa) without either
     screen literally sharing a tab strip with the other. This is my
     recommendation — it keeps one unambiguous home for Invitations (so
     "where do I click for invitations" always has one answer) while still
     making the Questions ↔ Invitations relationship a one-click hop, which
     is most of what "together in a tab" is actually asking for.
2. **Does Timeline join Tasks' sub-tabs (§1A) as a third one, alongside
   Calendar and Board, or stay a separate top-level `Nav` entry?** The
   planner's wording named only Calendar and Board. Recommendation: fold
   it in as a third sub-tab — it's the same `list_items` rows in a third
   layout, sitting right next to Calendar and Board in today's flat nav
   already, and leaving it as a lone standalone entry after its two
   siblings move would read as an inconsistency rather than a choice.
3. **Does Households join the Guests hub as a fourth tab**, or stay reached
   only from a guest row / `/households/new`, as today? Not asked for
   directly. Recommendation: leave it as-is for this pass — a household is
   usually reached *from* a specific guest, not browsed as its own top-level
   destination, so it doesn't obviously want the same "browse this section"
   framing Guests/Ranking/Invitations share. Worth asking rather than
   assuming, since "guests" as a concept does include households.
4. **Sub-tab strip styling**: a full-width bar under the page heading (like
   `ListsSidebar`'s vertical list, but horizontal), or something visually
   closer to `Nav` itself, just one level down? Recommendation: closer to
   `Nav` — same active/inactive treatment, same `aria-current`, so a planner
   already reads "this is how tabs work here" without a second visual
   language to learn for the sub-level.
