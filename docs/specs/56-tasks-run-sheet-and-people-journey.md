# Feature spec: Finding your way through tasks, the run sheet and who's doing what

**Status: built (2026-11-24); see Build status at the end.** Asked for as a spec, every question answered the same day,
then "Let's build".

No feature is removed. Every screen stays; the only things taken away are the run sheet header's "Day links →"
button (the Day links tab replaces it) and the browser remembering the run sheet's last view (the URL holds it).

**Depends on:** spec 1 (lists and the planning timeline), spec 13 and spec 41 (navigation), spec 39 (people),
spec 48 (phone tab bar), spec 50 (run sheet), spec 54 (day links), spec 55 (on the day). No migration.

## 1. What was asked

The planner finds it hard to find what has been built for tasks, the timeline and allocating people to jobs.
The screens exist but the route through them isn't one a person would guess. Investigate the user journey and
spec how navigating it should work.

## 2. Story

> **As the couple or our planner**, **I want** the screens for "what do we need to do before the wedding" and
> "who does what on the day" to sit where I'd look for them, in the order I'd use them, with one name for
> each thing, **so that** I can find a feature without already knowing where it was put.

## 3. How it works today (the journey as built)

Two separate features carry the same words:

| | Planning tasks | The day |
|---|---|---|
| What it is | To-dos over the months before (`list_items`) | What happens, hour by hour, on the day (`run_sheet_items`) |
| Sidebar | Planning → **Tasks** | The day → **Events & run sheet** |
| Its "Timeline" | `/timeline`: months, Gantt-style, a tab on Tasks | A view toggle inside `/run-sheet`: hours |
| Assigned to | One person: a collaborator or a person (spec 39) | Several: collaborators, guests, vendors, people |
| Seeing one person's load | Only "Assigned to me" | The run sheet's **People** toggle, or its Show filter |

Where each part of "allocating people" lives, and how you reach it on a laptop:

| Job | Where it is | Clicks from the sidebar | Problem |
|---|---|---|---|
| Open the run sheet | `/run-sheet` | Events & run sheet → **Run sheet →** on any event | The run sheet has no nav entry of its own. Every event's button opens the same whole-wedding sheet, so it looks per-event and isn't. |
| See who's doing what | `/run-sheet`, People toggle | 2 + a toggle | The toggle isn't in the URL; it's remembered in the browser, so the sheet sometimes opens in People and sometimes not, and nothing can link to it. |
| Add a helper (a person) | Settings → People | Settings, scroll | Outside "The day" entirely. Also offered inline in the run sheet item editor, which few would find. |
| Give helpers their link | `/run-sheet/links` | 2 + **Day links →** | Three levels down, reached only from the run sheet's header button. Not in the sidebar or ⌘K. |
| Groups, day contacts, Good to know, cues, announcements | `/run-sheet/links` | Same | The screen is named for links, but most of what's on it is about the day's people and information. |
| One guest's or vendor's day jobs | "Tasks on the day" on `/guests/[id]`, `/vendors/[id]` | Via Guest list / Vendors | A spec 39 person has no such page, so the helpers you add most often have no place that shows their day. |
| Check nothing is missed | `/day` → Readiness | The day → On the day | The best guide to "what's left" sits in the screen named for the day itself; its Fix links go to the run sheet without opening the right view. |

On the phone: More → Events & run sheet → Run sheet → Day links is four taps; the run sheet and day links are
never on the tab bar until the wedding day itself (spec 55).

⌘K offers sub-views for Tasks, Guest list, Design and Registry; it offers nothing under the run sheet.

## 4. Principles

1. **One name, one thing.** "Tasks" means planning to-dos. "Timeline" means the planning timeline. The day uses
   its own words.
2. **The nav follows the order you work in.** Plan the events → lay out the day → put people on it → send them
   their links → run the day.
3. **Every view has a URL.** A view you can reach is a view you can link to, go Back to, and find in ⌘K.
4. **A person's day is one click from wherever that person appears.**
5. **Regroup and rename; don't move data or rebuild screens.** Existing URLs keep working.

## 5. Words

| Thing | Word in the app | Replaces |
|---|---|---|
| A planning to-do (`list_items`) | **task** | (unchanged) |
| `/timeline` | **Timeline** | (unchanged) |
| An entry on the run sheet (`run_sheet_items`) | **job** in planner screens ("Add job", "Jobs on the day") | "item", "task" |
| The run sheet's hour-by-hour view | **By the hour** | "Timeline" |
| The run sheet's flat view | **List** | (unchanged) |
| The run sheet's per-person view | **Who's doing what** | "People" |

The helper's own page (`/d/[token]`) keeps its wording; a helper only ever sees one kind of task.

## 6. The day, regrouped

### 6.1 Sidebar and ⌘K

The "The day" group lists its entries in working order:

| Entry | Route | Lights for |
|---|---|---|
| Events | `/events` | `/events`, `/seating` |
| **Run sheet** | `/run-sheet` | `/run-sheet` and everything under it |
| Shot list | `/shots` | `/shots` |
| On the day | `/day` | `/day` |

"Events & run sheet" becomes "Events". Spec 41's rule that seating stays under Events still holds.

### 6.2 Run sheet sub-tabs

The run sheet gets a `SubTabs` row like Tasks and Guest list (`RUN_SHEET_TABS` in `src/lib/nav-tabs.ts`), which
⌘K lists as sub-views:

| Tab | Route | What it holds |
|---|---|---|
| Schedule | `/run-sheet` | By the hour / List toggle, Day picker, Show filter, Add job |
| Who's doing what | `/run-sheet/people` | Today's People view: one row per person, unassigned jobs first, link state, assign several |
| Day links | `/run-sheet/links` | Today's Day links screen, unchanged |

- The By the hour / List toggle is `?view=list` (absent means By the hour). The browser-remembered choice goes;
  the URL is the only state.
- The Show filter is `?who=<assignee key>` on both Schedule and Who's doing what; on Who's doing what it scrolls to
  and highlights that person's row.
- `?event=<id>` on Schedule shows only that event's jobs, with a "Showing <event> · Show all" line. Each event's
  **Run sheet →** button on `/events` opens `/run-sheet?event=<id>`. An event with no jobs shows the empty state
  with Add job, the event pre-filled.
- The header's **Day links →** button goes; the tab replaces it.

### 6.3 Readiness points at the right view

`src/lib/day-master/readiness.ts`'s Fix links use the new URLs: "Tasks with nobody assigned" →
`/run-sheet/people` (unassigned are first there); "People without a day link", "Links never opened", "Helpers
with no phone" → `/run-sheet/links`; "Open tasks with places still free" → `/run-sheet/people`. Their labels say
"jobs" per §5. Readiness stays only on `/day`; the run sheet tabs don't repeat it.

## 7. People: one click to their day

- **Settings → People:** each person's row shows "N jobs on the day · N tasks" (zero hidden), linking to
  `/run-sheet/people?who=person:<id>` and `/lists?view=all&who=p:<id>`. A line above the list: "Helpers for
  the day are added here or straight from a job."
- **Who's doing what:** a "Add or edit people" link to `/settings#people`.
- **Guest and vendor pages:** "Tasks on the day" becomes "Jobs on the day" and gains "See on the run sheet" →
  `/run-sheet/people?who=<type>:<id>`.
- **Planning tasks by person:** the Tasks smart view "All" takes `?who=` (the assign picker's value: `u:<user id>` for
  a collaborator, `p:<person id>` for a person) with a "Who"
  select beside it; "Assigned to me" stays as it is. The filtering is a pure function in `src/lib/lists/`.

## 8. Phone

The tab bar is unchanged (Today · Tasks · Guests · Website · More; Live replaces Today on the day, spec 55).
More lists "The day" in the §6.1 order, so the run sheet is two taps (More → Run sheet) and the sub-tabs scroll
sideways like the other sections' (spec 48).

## 9. Answered (2026-11-24)

1. **A run sheet entry is a "job"** in planner screens; the helper's page keeps its wording. Rejected: "job" on
   the helper's page too.
2. **Groups, day contacts, Good to know, cues and announcements stay on Day links.** Rejected: a "Day info" tab.
3. **No readiness line on the run sheet tabs** (against the recommendation); readiness stays on `/day`.
4. **Planning tasks get the "Who" filter** on All (§7).
5. **"The day" is in working order:** Events, Run sheet, Shot list, On the day.

## 10. Build order (once answered)

1. `nav-groups.ts`, `nav-tabs.ts` (`RUN_SHEET_TABS`), command palette sub-views; tests for `activeHref` on
   `/run-sheet/*` and the palette listing.
2. `/run-sheet/people` route; `?view=`, `?who=`, `?event=` on the run sheet, read on the server and passed in;
   remove the localStorage view.
3. Wording per §5; Events' Run sheet button; readiness hrefs.
4. People links and the `?who=` filter on "All" (§7).

No migration. Verify with typecheck, unit tests and build, and render `/run-sheet`, `/run-sheet/people` and
`/run-sheet/links` in headless Chromium at 1280 px and 390 px.

## 11. Acceptance

Someone who has never used the app, given "make sure the best man has a link for the day" and "see what Mere
is doing at 3pm", finds both from the sidebar without help, and from ⌘K by typing "who" or "links".

## 12. Build status

Built as specified, with these differences. No migration.

- The Who filter on All tasks uses the assign picker's encoding (`u:` / `p:`), not `person:<id>` (§7).
- Settings → People counts a person's **open** tasks (not done, not in an archived list); the link goes to All, which
  also lists their done ones.
- `?who=` on Who's doing what marks and scrolls to the person; if they have no jobs it says so.
- The day picker on Schedule is still local state, not in the URL.
- Only run sheet screens, the item editor, readiness and the "Jobs on the day" panels say "job"; the On the day
  master, Day links screen and shot list keep their existing words for now.

**Verified:** typecheck, 1622 unit tests, `npm run build`. **Not verified:** any screen in a browser, on a phone or
against live Supabase.
