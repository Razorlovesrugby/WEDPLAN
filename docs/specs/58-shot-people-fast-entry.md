# Feature spec: Fast people entry on the shot list

**Status: proposed.** Asked for 2026-11-24. Nothing is built until the planner
says to build it (see `docs/specs/README.md`). Open questions are in §7.

**Depends on:** spec 52 (the shot list, `shots`, `shot_people`, the shot
editor in `src/components/shots/shots-screen.tsx`), spec 45 (no-drag), spec 46
(shortcuts). No migration.

## 1. What was asked

The same people appear in many shots (the couple, the parents, a whole
family). Adding them one at a time through the guest search box is slow.
Entering people for a shot should be quick: copy from the previous shot, or
pick from a short list, without typing names again.

## 2. Story

> **As the couple**, building the family formals, **I want** the next shot to
> start from the people in the last one, **so that** I only change who is
> different instead of re-adding fifteen names.

## 3. What changes

All changes are in the shot editor (spec 52 §6) and the shot rows. People
chips, the guest search and the role field stay as they are.

### 3.1 Duplicate a shot

- Each shot row and the editor have **Duplicate**.
- The copy has the same title, kind, people, must-have, minutes, note and
  shooter, and sits directly after the original. It has no status (always
  "to do") and no reference image.
- The editor opens on the copy with the title selected, so typing replaces it.
- It is one server action (`duplicateShot`), so the copy and its people are
  created together or not at all.

### 3.2 Same people as…

At the top of "People in it", when the shot has no people yet:

- **Same as previous shot** (one tap): adds the people of the shot above it in
  the section. Hidden when it is the first shot or the previous shot has no
  people.
- **Copy people from…**: a drop-down of every shot in the wedding, current
  section first, newest edited first, each labelled with its title and people
  count. Choosing one **adds** its people to those already chosen (people
  already in the shot are skipped). It never removes anyone.
- **Clear** removes all chips, so "Replace" is Clear then copy. Nothing is
  saved until the editor's Save, so a wrong tap is undone by Cancel.

### 3.3 Quick picks

Under the chips, one row of tap-to-add buttons, each one tap, each hidden once
that person is in the shot:

1. **Couple**: the `people` entries of the wedding's couple (spec 39).
2. **Recent**: the people from the last three shots edited, most recent first,
   at most 8.
3. **Whole household**: a drop-down of the guest list's households and sides
   ("Aroha's side", "The Smith household"). Choosing one adds every non-deleted
   guest in it. Guests who declined are included, since the photo may be taken
   whatever the RSVP says.

### 3.4 Pick several without closing

The guest search becomes a checklist that stays open after each pick, so
adding five guests is five taps and a search, not five round trips. It shows
the guest's relationship and photo thumbnail when they have them (spec 52
§4.3). Enter on a single match adds it and clears the box (spec 46).

### 3.5 Bulk: people into several shots

On a section's list, ticking shots shows **Add people to ticked shots**. It
opens the same people chooser and adds those people to every ticked shot,
skipping any already in it. One server action, all or none.

## 4. Rules

- A person is never in a shot twice (the existing `shot_people` key,
  `personKey`). Every copy and add path skips duplicates.
- A guest soft-deleted since the source shot was saved is skipped, not copied.
- "Recent" and "Copy people from…" read only what the page already loaded;
  there is no extra query.
- Everything works with buttons and keys; nothing needs drag (spec 45). On a
  phone each tap target is at least 44 px (spec 48).
- Every write is a server action returning `ActionResult`, and its Supabase
  errors are checked (project rule).

## 5. Code

- `src/lib/shots/people.ts` (new, pure, unit-tested): merge people lists
  without duplicates, `recentPeople(sections, n)`, `householdPeople`. The
  editor and both actions use it.
- `src/server/actions/shots.ts`: `duplicateShot(shotId)`,
  `addPeopleToShots(shotIds, people)`.
- `src/server/queries/shots.ts`: also return each guest's `household_id` and
  household name.
- `src/components/shots/shots-screen.tsx`: the editor additions above.
  The file is already 538 lines; the new chooser goes in its own component
  file.

## 6. Out of scope

- Remembering named, reusable groups beyond households and sides ("saved
  groups"). Spec 52 §4.5's "Suggest groups" already builds the standard
  family formals.
- Changing the photographer's day-link module: it only reads the result.
- Copying the reference image or status.

## 7. Open questions

1. **Duplicate and must-have.** Should a copy keep must-have on? Recommended:
   no, a copy is usually a variation, and a duplicated must-have inflates the
   must-have count. The title and people are what is being reused.
2. **Bulk add (§3.5).** Include it now, or only duplicate, copy-from and quick
   picks first? Recommended: include it; family formals are where the same
   five people join ten shots.
3. **Households.** Is "household" the right grouping, or do you also want
   guest "tags" or relationship text ("Smith family") as groups? Recommended:
   households and sides only, since they exist already and need no new data.

## 8. Build order

1. `src/lib/shots/people.ts` and its tests.
2. `duplicateShot` and `addPeopleToShots`, with the query change.
3. Editor: Duplicate, Same as previous, Copy from, Clear.
4. Editor: quick picks and the open checklist.
5. Bulk add on the section list.
6. Typecheck, tests, build; a real browser and phone for the editor.
