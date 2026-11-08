# Feature spec: The inspector, and one look for everything guests see

**Status: built (2026-11-08), branch `claude/nice-mccarthy-x93m9s`, no PR.** Migration `0046`, **not
applied to the live project**. The scope was narrowed before asking, because specs 42/43 had already
done part of it: Design tabs have controls beside a live preview, and the save the date already
offers the invitation's colours. Three questions were put (§10); the planner chose the switch *off*
by default (against the recommendation), side panels for all four kinds of screen, and "Both"
(update the spec and build). **§11 is what was built**; §4–§9 are the original proposal, kept for
the record.

**Depends on:** spec 41 (the shell), spec 42 (the journey screen), spec 23/24 (site builder and
theme), spec 27–30 (save the date), spec 35 (RSVP form theme), spec 36/38 (registry design and
preview).

## 1. What was asked

"Simplify it while keeping maximum customisation and flexibility", in the style of an Apple app.
Mac apps keep customisation in an **inspector**: a panel on the right that shows the settings for
whatever is selected and stays out of the way when closed.

## 2. Story

Sam opens Invitations → Save the date → Design. The preview fills the middle. On the right, the
inspector shows **Use website theme ●** (on), and below it, greyed out, the palette and type
choices. Sam switches it off, picks a different photo treatment just for the save the date, and
the preview updates. The registry, still on "Use website theme", keeps matching the website.

## 3. What's there now

There are **three separate design systems** for what guests see:

- **Website**: `site_theme`: theme, palette, typography, text colour, motion
  (`src/components/site/editor/theme-editor.tsx`). The RSVP form already follows it (spec 35).
- **Save the date**: its own editor (`SaveTheDateEditor`) that **partly** inherits the site theme
  (`siteTheme` is passed in).
- **Registry**: its own six palettes and three type pairings (`registry_settings.palette`,
  `type_pairing`; `src/components/registry/settings-form.tsx`). That was a deliberate decision in
  spec 36.

And **three different places to put settings**: the site builder's left rail, full-page forms
(registry "Page & address", Settings), and inline toggles.

## 4. The proposal

### 4.1 The inspector pattern

- A **right-hand panel about 280px wide**, used anywhere the main area shows something you're
  designing or something with many options: the site builder, save the date, invitation, RSVP,
  registry page, a task, a vendor, a budget line.
- **Toggle with a toolbar button** (and ⌘⌥I, spec 46). Open/closed is remembered per browser.
- **On a phone it's a bottom sheet** that opens from the same button.
- **The panel's state is in the URL** (`?inspect=theme`), so a link opens it. That helps an AI
  assistant and the Back button.
- **Its controls are real, labelled form controls** with a visible label and no hover-only UI.
- This **moves** existing editors into a common frame (`<Inspector>` component). It doesn't
  rewrite them. The site builder's rail becomes the inspector's content; the block list stays on
  the left.

### 4.2 One look, with an opt-out per piece

- The website theme becomes **the wedding's look**.
- **Save the date, RSVP and registry** each get a **Use website theme** switch at the top of
  their inspector, **on by default for new weddings**.
- Switched off, that piece's own controls appear, which are exactly the ones it has today. Nothing
  is removed.
- **Existing weddings**: whichever registry palette and type pairing a couple has set stay
  in use (the switch starts **off** for any wedding whose registry settings differ from the
  defaults). Nothing a couple has chosen changes under them.

### 4.3 Where the registry's look maps onto the site's

The registry uses its own palette IDs. "Use website theme" needs a mapping from the site's palette
and typography onto the registry's renderer. That means one pure function in `src/lib/registry/`,
unit-tested over every site palette for contrast.

## 5. Not in scope

- New design options. This only rearranges and links the ones there are.
- Making the invitation page's look independent of the website (it already follows it).
- Inspector content for screens that don't need one (Today, Inbox).

## 6. Data

A migration, next free number at build time (`0046` today), additive only:

- `registry_settings.use_site_theme boolean not null default true`, then set to `false` for
  existing rows whose palette or pairing isn't the default.
- The save-the-date content row gets the same flag, on the same rule.
- Both are audited like their tables. `planner_table_access` is unchanged (no new table).

## 7. Files (expected)

- `src/components/shell/inspector.tsx` (new): the frame, the toggle, the bottom sheet, `?inspect=`.
- Site builder (`builder.tsx`): the rail goes into the inspector.
- `SaveTheDateEditor`, registry `settings-form.tsx`: a "Use website theme" switch, and their own
  controls shown only when it's off.
- `src/lib/registry/site-look.ts` (new, pure): the site → registry palette mapping.
- `supabase/migrations/00NN_use_site_theme.sql`, `supabase/tests/NN_use_site_theme.sql`.

## 8. Test plan

- SQL: defaults, the backfill rule for existing rows, RLS with a second account, audit rows.
- Unit: the palette mapping hits AA contrast for every site palette.
- Unit: a registry/save-the-date render with the switch on matches the site theme; off, it
  matches its own settings exactly as today.
- Headless Chromium: inspector open/closed at 1280; bottom sheet at 390; `?inspect=` deep links.
- typecheck, test, verify-migrations, build.

## 9. Open questions

| Q | Question | Recommendation |
| --- | --- | --- |
| 1 | Should the registry follow the website's look by default? (Spec 36 chose its own design.) | **Yes for new weddings, with the switch.** Existing choices kept. |
| 2 | Inspector on the right on laptop? | **Yes.** It's the Mac convention. |
| 3 | Which screens get an inspector in this spec? | **Site, save the date, invitation, RSVP, registry page.** Tasks, vendors and budget lines later. |
| 4 | Keep the site builder's block list on the left and move only its settings into the inspector? | **Yes.** |

## 10. Answered (2026-11-08)

| Q | Question | Answer |
| --- | --- | --- |
| 1 | A "Use invitation theme" switch on the registry? | **Yes, but off by default**, for every registry, new or existing (against the recommendation of on for new weddings). |
| 2 | Which screens get the side panel? | **All four:** task details, vendor details, budget line details, section ⋯ settings. |
| 3 | Build now or spec only? | **"Both"**: update the spec and build it. |

Dropped from the original proposal, because it was already done: the panel on Design screens (spec
42's `DesignFrame` is controls + preview), and the save the date's switch (its palette picker already
has the invitation's colours).

## 11. Build status (2026-11-08)

**Registry: "Use the invitation's look"**

- **`0046_registry_use_site_theme.sql`** adds `registry_settings.use_site_theme boolean not null
  default false`. There's no backfill, so every registry is off, and `palette` and `type_pairing` are
  kept. `supabase/tests/27_registry_use_site_theme.sql` (4 assertions) checks:
  - it's off by default;
  - turning it on keeps the choices;
  - it can't be null;
  - the change is audited.

  `scripts/check-migrations.sql` now lists `0045` and `0046` (it was stale at `0044`).
- **`registryLook()`** (`src/lib/registry/look.ts`, 4 new tests):
  - off, it returns exactly the old colours and pairing;
  - on, it returns the invitation's five colours and nearest pairing (Fraunces/Garamond → Classic,
    Garamond/Inter → Bookish);
  - if the invitation's theme can't be read, it falls back to the registry's own look.
- **The guest page** (`/registry/<slug>`, its link-preview image): `loadInvitationLook()` reads the
  invitation's theme only when the switch is on. **These are the only guest-facing files changed**,
  and with the switch off, which is everyone, they render exactly as before. The preview image now
  reads `*` rather than a column list, so it keeps working before `0046` is applied.
- **Registry → Page & address → The look** gets the switch; the palette and lettering pickers go
  dim while it's on. The form only sends the switch once it has been changed, so saving keeps working
  on a database without `0046`. **Turning it on before `0046` is applied will fail with a column
  error.**

**The side panel** (`src/components/shell/inspector.tsx`)

- One per window, in the shell. It's on the right (420px) from `lg:` up and a bottom sheet with a
  backdrop below that. It has Done and Esc to close, and focus moves into it when it opens.
- What's open is in the address as `?inspect=<key>`, so a link opens it, reload keeps it, and
  Back/Forward follow it. Rows that hold their own data open it in place with
  `history.replaceState`; server-rendered panels use real links and a `closeHref`.
- **Tasks** (`item-row.tsx`): **every control stays in the row, as before** (follow-up below). A new
  **+ notes** / **Edit notes** button opens a **Notes** box in the panel (Save button and "Unsaved
  changes", spec 42 Q9). Before this, notes could be read in the row but not edited there.
- **Budget lines** (`budget-item-row.tsx`): **Edit** opens the line's edit form in the panel,
  instead of expanding it in the row. Payments and consumption components **stay in the row, as
  before** (follow-up below).
- **Vendors:** a vendor in the list opens `?inspect=vendor:<id>` with `VendorDetail` in the panel,
  keeping the list's filters. "Open the full page" goes to `/vendors/<id>`, which is unchanged.
- **⋯ settings:** List appearance (`/lists?panel=appearance`) and Pinterest & clipper
  (`/moodboards?panel=import`) open in the panel. The addresses are unchanged, so Settings' pointers
  and the Pinterest callback still land there. `SectionPanel` is removed.

**Departures:**

1. **The registry switch is off by default** (Q1), so the original backfill rule is moot.
2. **"Use website theme" is "Use the invitation's look"** in the words on screen, per spec 42 §2.
3. **Follow-up, same day: "make the edit on the one page… remove clicks."** The first build moved
   task dates, flag, priority and assignee, and budget payments, into the panel, which made each one
   an extra click. All of them are back in their rows exactly as before spec 44. The panel now holds
   only what used to need a separate step or didn't exist: a budget line's edit form, task notes,
   vendors, and the ⋯ settings.

**Verified:** `npm run typecheck`; `npm test`, 1361 tests; `./scripts/verify-migrations.sh`, 774
assertions (770 unchanged); `verify-migrations-single-tx.sh`; `verify-bootstrap.sh`; `next build`
(placeholder env); `guest-links-isolated.test.ts` still passes.

**Seen** on a temporary sample page in headless Chromium at 1280 and 390 wide (deleted, never
committed):
- the panel opens on the right and as a bottom sheet;
- the address gains `?inspect=`;
- Esc closes it and clears the address;
- opening the address directly reopens it;
- no horizontal scroll, no errors.

**Not verified:** any real task, budget line or vendor in the panel; the registry switch against a
database; the guest registry page with it on.
