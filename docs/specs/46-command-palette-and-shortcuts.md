# Feature spec: ⌘K to go anywhere or make anything, and Mac keyboard shortcuts

**Status: built (2026-11-08), branch `claude/nice-mccarthy-x93m9s`, no PR.** No migration. The
planner chose to do this before spec 45. Four questions were put, everything offered was picked, then
"Build it" (§10). **§11 is what was built.**

**Depends on:** spec 41 (the shell and its one array of sidebar entries, `src/lib/nav-groups.ts`).
Spec 44's inspector shortcut needs 44.

## 1. What was asked

Make it feel like an Apple app people can just use on their computers. On a Mac, people expect
⌘K (or Spotlight-style search), ⌘, for Settings, and Esc to close what's open.

## 2. Story

Sam presses **⌘K** and types "smi". The list shows *Smith family (household)*, *Smith, Jo
(guest)* and *Smithfield Catering (vendor)*. Enter opens the household. Later Sam presses ⌘K,
types "new task", and gets a sheet to add one. On a phone, the same palette opens from a search
button in the header.

## 3. What's there now

- **No global search** and no keyboard shortcuts beyond the browser's own.
- Each section has its own create buttons ("Add household", "New list"…), which call existing
  server actions.

## 4. The proposal

### 4.1 The palette

- **⌘K** (Ctrl+K on Windows) or the header's search button opens a centred dialog with one text
  field and a list of results.
- **Go to**: every sidebar entry and sub-view from `nav-groups.ts` (so it can't drift from the
  sidebar), plus Settings sections.
- **Find**: households, guests, vendors, lists, tasks, moodboards, by name. This uses a new
  `cache()`d query that returns at most 8 per kind, matched with `ilike` on the name columns,
  RLS as usual.
- **Make**: New task, New household, New vendor, New budget line, New moodboard, New event.
  Each opens the existing create form, as a sheet where one exists.
- **Keyboard**: ↑/↓ to move, Enter to open, Esc to close. Focus is trapped while open and goes
  back where it was after closing. Results are announced (`role="listbox"`, `aria-activedescendant`).
- **A planner login** sees only what it can open (the same filter as the sidebar).

### 4.2 Shortcuts

| Keys | Does |
| --- | --- |
| ⌘K | Palette |
| ⌘, | Settings |
| ⌘⌥I | Toggle the inspector (spec 44) |
| ⌘⇧S | Toggle the sidebar |
| Esc | Close the open sheet, palette or panel |
| ? | Show this list |

None of them fire while typing in a field, except Esc and ⌘K.

## 5. Not in scope

- Full-text search inside notes, tasks' descriptions or moodboard pins.
- Custom or user-set shortcuts.
- Search on the public site.

## 6. Data

**No migration.** Search reads name columns that exist. If it's slow on a large wedding, add
trigram indexes in a later migration; the expected size (hundreds of rows) doesn't need them.

## 7. Files (expected)

- `src/components/shell/command-palette.tsx` (new, client).
- `src/server/queries/search.ts` (new, `cache()`).
- `src/lib/command-palette.ts` (new, pure): ranking (prefix match before contains, go-to before
  find before make), the planner filter. Unit-tested.
- `src/lib/shortcuts.ts` (new, pure): the key table and the "not while typing" rule. Unit-tested.
- `src/app/(planner)/layout.tsx`: mounts the palette and the key listener.

## 8. Open questions

| Q | Question | Recommendation |
| --- | --- | --- |
| 1 | Build the palette ourselves, or add a library (`cmdk`)? | **`cmdk`.** It's small and handles the keyboard and accessibility work. |
| 2 | Which things can be found: households, guests, vendors, lists, tasks, moodboards? | **Those six.** Add budget lines later if wanted. |
| 3 | Which things can be made from the palette? | **The six in §4.1.** |
| 4 | Include the shortcut list (`?`)? | **Yes.** |

## 9. Test plan

- Unit: ranking; planner filter; every sidebar href appears as a Go-to result.
- Unit: shortcuts don't fire in inputs and textareas (except Esc and ⌘K).
- SQL: none (reads only, through existing policies), though the search query is checked with a
  second account in the headless run.
- Headless Chromium: ⌘K opens, typing filters, Enter navigates, Esc restores focus; the search
  button works at 390 wide.
- typecheck, test, build.

## 10. Answered (2026-11-08)

| Q | Question | Answer |
| --- | --- | --- |
| Find | What can ⌘K find? | **All of it:** households and guests, vendors, tasks and lists, moodboards and budget lines. |
| Make | What can it create? | **All six:** task, household, vendor, budget line, moodboard, event. |
| Keys | Which shortcuts? | **All:** ⌘K, ⌘, (Settings), Esc, ⌘⇧S (sidebar) and ? (the list). |
| Build | | **Build it.** |

Q1 (library or hand-built) wasn't asked. It was built by hand to avoid a new dependency; see §11.

## 11. Build status (2026-11-08)

**What was built:**

- **`src/lib/command-palette.ts`** (pure). **Go to** is built from `navGroupsFor` plus every
  sub-view tab, so it can't drift from the sidebar; it also has Settings' account and activity
  sections, and Settings answers to "timezone" and "currency".
  - **Make**: "Add “…” to <list>" for up to five lists, "Add vendor “…”" and "New moodboard “…”" use
    the typed text directly. With nothing typed, New task, household, vendor, budget line, moodboard
    and event each open their own screen or form.
  - A planner login gets only task, vendor and event, and never a couple-only screen.
  - Ranking: the label starts with the query, then a word does, then it's anywhere in the label,
    hint or keywords. Go to comes before Find, which comes before Make, eight each. Case and
    accents are ignored.
  - `ilikePattern` escapes `% _ \` and the characters that would break PostgREST's `or()`.
- **`src/lib/shortcuts.ts`** (pure). ⌘K/Ctrl+K works everywhere, including in a field; ⌘, and ⌘⇧S
  likewise; a bare `?` never fires while typing. 18 tests cover both files.
- **Find** (`src/server/queries/search.ts`, `cache()`, via the `searchPalette` action). From two
  characters, eight of each kind, read as the signed-in person so RLS decides. Each kind fails soft.
  - Results link to: households and guests' pages; vendors in the side panel; lists; tasks with
    `?highlight=`; moodboards; budget lines in the side panel (`?inspect=budget:`).
  - Budget lines are never searched for a planner login.
- **The dialog** (`src/components/shell/command-palette.tsx`): a text box plus a listbox with
  `aria-activedescendant`.
  - Keys: ↑/↓, Enter, Esc. Esc stops there, so an open side panel stays open; focus returns to where
    it was; Tab stays in the box.
  - It searches 150 ms after typing stops, and still offers Go to and Make if the search fails.
  - The **Search** button in the header opens the same box for iPad and phone.
  - **?** or "Shortcuts" shows the list of shortcuts.
- **Shortcuts** are listened for in `ShellFrame`. ⌘, does nothing for a planner login.

**Departures:**

1. **Hand-built, no `cmdk`** (§8 Q1 had recommended `cmdk`): no new dependency.
2. **⌘⌥I (toggle the side panel) wasn't added.** The panel opens from a row and closes with
   Done or Esc, so a toggle with nothing selected would do nothing.
3. **"New budget line" and "New event"** go to their screen rather than straight into a form,
   because a budget line needs a category and an event a date. "New household" opens
   `/households/new` directly.

**Verified:** `npm run typecheck`; `npm test`, 1379 tests (18 new); `next build`.

**Seen** in headless Chromium on a temporary sample page (deleted):
- ⌘K opens the box with focus in it;
- typing "cal" puts Calendar first;
- Esc closes it;
- `?` in a text field types a `?`, while outside a field it opens the shortcut list;
- ⌘⇧S hides the sidebar;
- Enter goes to `/calendar` (the sign-in page there, with no session);
- at 390 wide the Search button opens it with no horizontal scroll;
- no errors.

**Not verified:** Find against real data (it needs Supabase); creating a task, vendor or moodboard
from the box; a real iPad keyboard.
