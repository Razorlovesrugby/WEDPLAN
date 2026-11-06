# Feature spec: ⌘K to go anywhere or make anything, and Mac keyboard shortcuts

**Status: proposal, not built.** Written 2026-11-06 from a discovery pass over the code.
Nothing here is authorised to build until §8's questions are answered and the planner says to
build it.

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
