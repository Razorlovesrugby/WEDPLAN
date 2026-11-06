# Feature spec: The inspector, and one look for everything guests see

**Status: proposal, not built.** Written 2026-11-06 from a discovery pass over the code.
Nothing here is authorised to build until §9's questions are answered and the planner says to
build it.

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
