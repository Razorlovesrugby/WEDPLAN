# Feature spec: The phone experience — no zoom, an iOS-style tab bar, Guests as cards

**Status: built (2026-11-10), branch `claude/vibrant-bohr-xd2w8t`, no PR.** No migration. The
planner asked for it to be built directly ("use the best UI practices … inspired by Apple apps and
fix this all"), so this spec records what was built rather than proposing it.

**Depends on:** spec 41 (app shell, nav groups, the tab bar this replaces), spec 45 (touch sizes),
spec 47 (the guest table, which stays the laptop view).

## 1. What was asked

The app is live and the planner found the phone experience poor:

- Tapping things zoomed the page, and the page then scrolled sideways.
- The Guests screen "zooms the fuck out and doesn't have a mobile view at all."
- The bottom bar was "shocking navigation."

## 2. What was wrong (measured, emulated iPhone 13, sample data)

1. **Guests zoomed out.** The guest table's screen-reader labels (`sr-only`, absolutely
   positioned) escaped its sideways scroller because the scroller wasn't a containing block, so
   the page was 746px wide on a 390px phone and Safari zoomed out to fit. Fixed by making the
   scroller `relative` (committed separately, before this spec).
2. **Tap-to-zoom.** Text boxes were 14px (`.field` is `text-sm`); iOS Safari zooms in on focus of
   any text box under 16px and never zooms back.
3. **Double-tap zoom** was still on, so a slow or double tap on a button zoomed the page.
4. **Bottom bar.** Five small grey words with no icons; four of the five tabs opened a menu page
   (`/menu?group=…`) rather than a place, so every trip took two taps.
5. **Header.** The account button was the full email address, crowding a phone header.

## 3. What was built

### 3.1 Everywhere (phone rules)

- **No accidental zoom.** Text inputs, selects and textareas in the planner are 16px on touch
  screens and below `md:` (`globals.css`). `touch-action: manipulation` on `html` turns off
  double-tap zoom. Pinch-zoom is kept on purpose: it is an accessibility setting, never an accident.
- **No page-level sideways scroll.** The shell's root has `overflow-x: clip` as a safety net, and
  every sideways scroller (`invitations-table`, `journey-table`, `event-grid`, `import-wizard`,
  `timeline-view`, the guest table) is `relative`, so nothing absolutely placed inside it can
  widen the page.
- **Header** (`(planner)/layout.tsx`): pinned to the top on a phone with a frosted background,
  like an iOS navigation bar, and padded for the status bar when installed to the home screen
  (`black-translucent` runs the page under it). Name over countdown; Search is a magnifying
  glass; the account menu is an initial in a circle, with the email inside the menu. Laptop
  header unchanged.
- **Section tabs** (`SubTabs`) span the width on a phone like an iOS segmented control.

### 3.2 Tab bar and More sheet

- `src/lib/nav-groups.ts`: `PHONE_TABS` — **Today · Tasks · Guests · Website**, each going
  straight to its page — plus **More**. `moreGroupsFor()` is every other place, grouped as in the
  sidebar. `activeTabId()` lights a place's own tab, else More. A planner gets Today, Tasks,
  Guests and More (they can't open the website). Tests check tabs plus More list exactly the
  sidebar's places, once each.
- `tab-bar.tsx`: icon over label, current tab in the accent colour, red badges (Inbox), frosted
  background, safe-area padding.
- **More** opens an iOS-style bottom sheet: grabber, "Done", inset grouped lists with an icon
  tile per place. Closes on the backdrop, Escape, a downward swipe, "Done", or arriving at a page.
  The button is a link to `/menu`, which lists the same places, so it works before JavaScript
  loads, in a new tab, and for old `/menu?group=…` links.
- `nav-icon.tsx`: inline SVG line icons in the spirit of SF Symbols; no icon library.

### 3.3 Guests on a phone

Below `md:` the table and its View/Rows controls are hidden and replaced by cards
(`guests-table.tsx`, `phoneCards()`); from `md:` up nothing changed.

- **Header:** large "Guests" title, ⋯ (Export guests, Catering numbers, Import CSV) and a round
  **+** for Add household — the iOS navigation-bar pattern.
- **Reply summary** (`event-summary.tsx`): one card per event in a row you swipe through, with
  short labels (Yes · Maybe · No · No reply), so the list starts on the first screen.
- **Search** as an iOS search field; the other filters fold away behind a **Filters** button
  (accent-filled when any are on, with the count).
- **One card per household:** name (to the household page), guest count and tier, the Links
  menu; a header row of event names; then a row per person (name to their page, with can't
  attend / age / dietary underneath) and a mark per event.
- **Tapping a mark** opens an iOS action sheet with that person's choices for that event (the
  same actions as the table cell: record an answer, invite, remove, mark sent) and Cancel
  (`invite-cell.tsx`, `layout="sheet"`).
- "What the marks mean" folds out under the list.

## 4. Not done

- Bulk selection (tag, move) stays laptop-only.
- Inline editing of last name, email and dietary stays laptop-only; on a phone they're edited on
  the guest's page.
- Other screens (Tasks, Budget, Vendors, the household and guest pages, Website) got only the
  shared fixes (no zoom, no sideways page scroll, header, tab bar, section tabs). None of them was
  redesigned for a phone, and none was seen on one: they need live data the sample page doesn't
  have.

## 5. Verified

Typecheck, unit tests, production build. Guests, the filters, the action sheet, the More sheet
and the account menu were rendered on an emulated iPhone 13 (Playwright, sample data, on a
throwaway page built from the real layout and Guests page, since deleted): page width 390px in
every state, search box 16px. The laptop guest table was rendered at 1280px and is unchanged.
**Not verified:** a real iPhone, live Supabase data, the household and guest pages on a phone,
iPad.
