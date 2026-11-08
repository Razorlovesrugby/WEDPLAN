# Feature spec: The app shell — a grouped sidebar, a phone tab bar, and Settings that only holds what's global

**Status: built (2026-11-08), branch `claude/nice-mccarthy-x93m9s`, PR #89.** No migration.
Written as a proposal on 2026-11-06. On 2026-11-08 the planner said "Can you build the first spec,
ask me the questions"; the six questions were put and answered (§10, Q3 against the
recommendation), then it was built. **§11 says what was built and where it departs from §4.**
Checked by typecheck, unit tests, `next build` and headless Chromium on a sample page. **Never
opened against Supabase or with real data.**

**Depends on:** spec 13 (the current hub layout), spec 39 (planner login, `planner-routes.ts`),
spec 40 (Settings → Your account). **First of a set of six (41–46)** that reorganise the app
around a Mac-style window. 42–46 all sit inside the shell this one makes, so this goes first.

**Decided before writing (2026-11-06):** laptop first; must also be easy to use on a phone and
easy for an AI assistant driving a browser to find its way around.

## 1. What was asked

> "It's not the easiest to understand where everything is — the settings, the toggles, where
> the invites and save the date and guests live. Simplify it while keeping maximum
> customisation and flexibility. I want it to feel like an Apple native app people can just
> use on their computers."

## 2. Story

Sam opens WEDPLAN on a laptop. A sidebar on the left lists everything in four groups, the way
Mail or Notes does. Sam clicks **Guest list**, then switches to **Ranking** using a segmented
control at the top of the screen, which works the same way in every section. Sam wants to move
the cut line. That control used to be in Settings and is now in Guest list's **⋯** menu. Later,
on a phone, Sam taps **Guests** in a tab bar at the bottom and lands in the same place.

## 3. What's there now

- **Eleven flat links in one wrapping row** (`src/components/nav.tsx`): Overview, Guests,
  Budget, Vendors, Events, Questions, Tasks, Moodboards, Registry, Site, Settings. Below `sm:`
  they fold behind a "☰ Menu" button into a dropdown.
- **Three ways to switch views inside a section.** Guests and Tasks use `SubTabs`
  (`src/lib/nav-tabs.ts`, 10 pages). Registry has its own tabs (`src/app/(planner)/gifts/layout.tsx`).
  Site uses a side rail. Events uses a page per event.
- **Settings mixes app-wide and per-feature settings** (`src/app/(planner)/settings/page.tsx`):
  Your account, Wedding basics, **Cut lines & capacity** (guest list), People, **List
  appearance** (tasks), Download, Activity, **Pinterest** and **web clipper** (moodboards),
  Privacy notice.
- **Screens with no path to them.** `/travel` and `/gallery` are reached only through a site
  block's inspector link (`managedElsewhere` in `src/lib/site/block-fields.ts`). Attire, gifts,
  songs, guestbook and guest questions are a list under "Elsewhere" at the bottom of the site
  rail (`src/components/site/editor/builder.tsx`).
- **"Questions" in the nav means RSVP questions.** That's easy to confuse with the guest
  questions inbox at `/site/questions`.
- **Four detail pages set no `<title>`:** `guests/[id]`, `households/[id]`, `lists/[id]` and
  `moodboards/[id]`. Every guest's tab just reads "WEDPLAN".
- **Account and sign-out** are the email address as a button in the header.

## 4. The proposal

### 4.1 The sidebar (laptop, `md:` and up)

A fixed left column about 220px wide that can be collapsed. Groups and entries:

| Group | Entry | Today's route(s) — **unchanged** |
| --- | --- | --- |
| — | **Today** | `/` |
| Planning | Tasks | `/lists`, `/calendar`, `/board`, `/timeline` |
| | Budget | `/budget` |
| | Vendors | `/vendors` |
| | Moodboards | `/moodboards` |
| People | Guest list | `/guests`, `/guests/rank`, `/households`, `/guests/import` |
| | Seating | `/seating`, `/events/[id]/seating` |
| The day | Events & run sheet | `/events`, `/run-sheet`, `/events/[id]/run-sheet` |
| For guests | Invitations | `/invitations`, `/invitations/save-the-date`, `/questions` |
| | Website | `/site`, `/site/*`, `/travel`, `/gallery` |
| | Registry | `/gifts`, `/gifts/*` |
| | Inbox | (spec 43; until then `/site/questions`) |
| — | Settings | `/settings` |

- **URLs don't change.** This is a regrouping of links, not a route move. Bookmarks, emailed
  links, `planner-routes.ts` and the public-prefix rule (`/registry` is public, so the
  couple's screens stay under `/gifts`, spec 36) are all untouched. An entry lights up for any of
  its routes, as `matchPrefixes` does today.
- **Invitations moves out of Guests** and into For guests. The Guests sub-tabs lose
  Invitations and Save the date, leaving Guests and Ranking. Spec 42 rebuilds the Invitations
  entry; until then it opens today's `/invitations` page with its own tabs: Invitations, Save the
  date, RSVP questions.
- **"Questions" is no longer a top-level entry.** RSVP questions becomes a tab under
  Invitations, with the label **RSVP questions**.
- **Seating gets its own entry**, because seating is planned guest by guest, not event by event.
- **A planner login** sees only its groups' allowed entries, exactly as `PLANNER_NAV_HREFS`
  filters today. A group left with no entries isn't shown.
- **The header** keeps the wedding name, date and countdown. The email/sign-out button becomes
  a small account menu (Account settings, Sign out).

### 4.2 The phone tab bar (below `md:`)

An iPhone-style bar fixed to the bottom with five tabs: **Today · Planning · Guests · For
guests · More**. Tapping a group tab opens a simple list of that group's entries (a page, not a
popover). **More** holds The day and Settings. The bar is built from **the same data as the
sidebar** (one array in `src/lib/`), so the two can't list different things. It respects the
bottom safe-area inset.

### 4.3 One way to switch views: a segmented control

`SubTabs` becomes a segmented control placed at the top of the content, left-aligned under the
page title. It's the same component everywhere a section has more than one view: Tasks (List /
Calendar / Board / Timeline), Guest list (Households / Ranking), Invitations (spec 42's stages),
Registry (Items / Claims / Page & address). It stays as **real links** to real URLs. That's what
makes it work for the back button, bookmarks and an AI assistant.

### 4.4 Settings holds only what applies to the whole wedding

| Section | Moves to |
| --- | --- |
| Your account, Wedding basics, People, Download, Activity, Privacy notice | **Stays** |
| Cut lines & capacity | Guest list → **⋯ menu → Cut lines & capacity** (a sheet; `/guests?panel=cut-lines`) |
| List appearance | Tasks → **⋯ menu → List appearance** (`/lists?panel=appearance`) |
| Pinterest, Web clipper | Moodboards → **⋯ menu → Pinterest & clipper** (`/moodboards?panel=import`) |

Each moved block keeps its existing component (`CutLinePicker`, `CapacityControl`,
`ListAppearanceEditor`, `PinterestCard`, `ClipTokensCard`). It's mounted in a different place,
not rewritten. Settings shows a one-line pointer for one release, e.g. "Cut lines have moved to
Guest list → ⋯".

### 4.5 Every screen has a path to it

- **Website** gets a segmented control: Page (the builder) · Theme · Travel · Photos · Extras
  (attire, gifts, songs, guestbook). That makes `/travel` and `/gallery` reachable without first
  adding the matching block. The rail's "Elsewhere" list stays as a shortcut.
- **Guest questions** moves to the sidebar as Inbox (spec 43). Until then it's under Website →
  Extras.

### 4.6 Things that help a phone, a keyboard and an AI assistant alike

- **A page title on every screen**, with the most specific part first: "Smith family ·
  Guests", "Venue booking · Tasks". This fixes the four detail pages listed in §3.
- **The sidebar and tab bar are one `<nav aria-label="Main">`** with `aria-current="page"`, as
  today. Group headings are real headings or `role="group"` with a label.
- **Panels opened from ⋯ menus carry their state in the URL** (`?panel=…`), so the panel can be
  linked to, survives reload, and Back closes it.
- **Keyboard:** the sidebar's links can be reached with Tab. ⌘K and other shortcuts are spec 46.

## 5. Not in scope

- The guest journey screen (42), Inbox and Today (43), the right-hand inspector and shared
  theme (44), drag alternatives (45), ⌘K (46).
- Renaming routes. Any change to what a planner login can see.
- Dark mode, icons beyond simple glyphs for the tab bar, user-reorderable sidebar.

## 6. Data

**No migration.** Nothing here reads or writes new data. The collapsed sidebar state is a
per-browser convenience (`localStorage`, wrapped in try/catch).

## 7. Files (expected)

- `src/lib/nav-groups.ts` (new): the one array of groups → entries → `matchPrefixes`, plus
  the planner filter. Pure, with a unit test.
- `src/components/nav.tsx` → `src/components/shell/sidebar.tsx`, `tab-bar.tsx`, `account-menu.tsx`.
- `src/app/(planner)/layout.tsx`: two-column grid at `md:`, tab bar below.
- `src/lib/nav-tabs.ts` and `SubTabs`: the segmented control, with new tab lists for
  Invitations and Website.
- `src/app/(planner)/settings/page.tsx`: remove the three moved blocks and add pointers.
- `guests`, `lists`, `moodboards` pages: a ⋯ menu and a `?panel=` sheet.
- `generateMetadata` on the four detail pages.

## 8. Test plan

- Unit: every route directory under `src/app/(planner)` sits under exactly one sidebar entry.
  It's the same shape as `planner-routes.test.ts`, so a new section can't be orphaned again.
- Unit: the planner filter never shows a couple-only entry.
- Unit: sidebar and tab bar render the same set of hrefs.
- Headless Chromium at 1280 and 390 wide: every entry is reachable, `aria-current` is right,
  no horizontal scroll, and the tab bar clears the safe area.
- `npm run typecheck`, `npm test`, `npm run build`.

## 9. Open questions (as put)

| Q | Question | Recommendation |
| --- | --- | --- |
| 1 | Keep "Today" as the first entry's label now, even though the Today screen itself is spec 43? | **Yes.** Label it "Today" now so it doesn't change twice. |
| 2 | Group names: Planning / People / The day / For guests? | **Yes**, or give your own. |
| 3 | Seating as its own sidebar entry, or keep it inside Events? | **Its own entry.** You plan it from the guest list, not the event. *(Answered: inside Events.)* |
| 4 | Tab bar's five tabs: Today · Planning · Guests · For guests · More? | **Yes.** |
| 5 | How long do the "this has moved" pointers stay in Settings? | **Until spec 44 ships**, then remove them. |
| 6 | Should the sidebar be collapsible on laptop? | **Yes**, remembered per browser. |

## 10. Answered (2026-11-08)

| Q | Answer |
| --- | --- |
| 1 | **"Today"** as the first entry's label now. |
| 2 | **Planning / People / The day / For guests**, as written. |
| 3 | **Seating stays inside Events** (against the recommendation). No sidebar entry; `/seating` lights "Events & run sheet". |
| 4 | **Today · Planning · Guests · For guests · More.** |
| 5 | **Pointers in Settings**, until spec 44 ships. |
| 6 | **The sidebar can be hidden**, remembered per browser. |

## 11. Build status (2026-11-08)

**What was built:**

- **`src/lib/nav-groups.ts`**: the one list of groups and entries. The sidebar, the tab bar and
  `/menu` all read it. The lit entry is the **longest matching prefix**, so `/site/questions`
  lights Inbox and `/site/attire` lights Website.
- **Shell** (`src/components/shell/`): `Sidebar` (from `md:`), `TabBar` (below `md:`, fixed,
  safe-area padded), `ShellFrame` (the two columns and the Hide/Show sidebar button,
  `localStorage` key `wedplan.sidebar.collapsed`, every access guarded), `AccountMenu` (a
  `<details>` menu with Account settings and Sign out; a planner gets only Sign out), and
  `MoreMenu`/`SectionPanel` for a section's ⋯ menu. `src/components/nav.tsx` is deleted.
- **`/menu?group=<tab>`**: what a phone tab opens when it holds more than one place. It's a real
  page, so Back and links work. A tab with one place links straight to it (for example a planner's
  More is just Events). Added to `PLANNER_ROUTES`; it filters itself by viewer.
- **Segmented control.** `SubTabs` is restyled and accepts `matchPrefixes`. The tab lists live in
  `src/lib/nav-tabs.ts`:
  - Guest list: **Households · Ranking**. Invitations and Save the date left Guests.
  - Tasks: **List · Calendar · Board · Timeline**.
  - Invitations: **Invitations · Save the date · RSVP questions**. `/questions` now shows these
    tabs.
  - Website: **Page · Theme · Travel · Photos · Extras**, on `/site`, `/site/theme`, `/travel`,
    `/gallery`, `/site/extras` and the four extras pages.
  - Registry: **Items · Claims · Page & address**, moved from an inline array.
- **Settings** keeps Your account, Wedding basics, People, Download, Activity and Privacy
  notice, plus a "Moved to their own sections" box with three links.
  - **List appearance** → Tasks → ⋯ → `/lists?panel=appearance`.
  - **Pinterest & clipper** → Moodboards → ⋯ → `/moodboards?panel=import`. The Pinterest OAuth
    callback now returns there, the help and import pages link there, and the Pinterest/clipper
    actions revalidate `/moodboards` instead of `/settings`.
  - Both are **couple-only**, as they were in Settings. A planner gets no ⋯ items.
- **Page titles** on `guests/[id]`, `households/[id]`, `lists/[id]` and `moodboards/[id]` (for
  example "Smith family · Guests").

**Departures from §4:**

1. **Cut lines & capacity got no new panel.** `/guests/rank` already had `CapacityControl` and
   `CutLinePicker`, so the Settings copy was a duplicate. It's removed, and the pointer goes to
   Guest list → Ranking.
2. **Seating** stays inside Events (Q3).
3. **Extras is a page** (`/site/extras`) listing What to wear, A gift, Song requests and
   Guestbook. §4.5 described it as a segmented-control pane. The builder rail's "Elsewhere" list
   stays.
4. **Panels open as a card at the top of the section**, with a Done link, not as a sliding
   sheet. They're still addressed by `?panel=`. Spec 44's inspector replaces them.
5. **Inbox** links to `/site/questions` until spec 43.
6. The old wrapping link row on laptop and the "☰ Menu" dropdown on phone are both gone.

**Verified:** `npm run typecheck`; `npm test`, 1299 tests including the new
`nav-groups.test.ts` (36). That test checks:
- every planner page lights exactly one entry, except `/setup` and `/menu`;
- no two entries share a prefix;
- the planner's sidebar equals `PLANNER_NAV_HREFS`;
- the tab bar lists the same places as the sidebar;
- every section view is a real page.

`next build` passes with a placeholder env.

**Seen** in headless Chromium at 1280 and 390 wide, through a temporary page with sample content
that was deleted and never committed: the sidebar, tab bar, segmented control, ⋯ menu and account
menu render; no horizontal scroll; no console errors; the hidden sidebar stays hidden after
reload; the planner's sidebar and tabs are filtered.

**Not verified:** any real planner page inside the new shell (they need Supabase); the active
highlight in a browser (it's covered by unit tests only); a real phone; a screen reader; the
Pinterest callback round trip.

**Pick up here:** open the app against the live project and walk every sidebar entry on a laptop
and a phone. Check the site builder's sticky rail (`lg:top-[62px]` in `builder.tsx`) now that the
header is shorter.
