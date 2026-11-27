# Feature spec: The RSVP form asks for dietary needs in one free-text box; tags are the couple's to set

**Status: answered 2026-11-27, not built. The build waits for "build it".**

**Depends on:** spec 57 (Part H: the dietary tags, and the guest page, guest table, table drawer and seating screens that
read them), spec 35 (the RSVP form in the site theme: a guest who is not coming is not asked about food). **No migration.**

## 1. What was asked

The RSVP form is live: guests reply, and come back to change their answers. Spec 57 Part H put a tag picker on it. Take the
picker off the guest-facing form so the form is exactly what it was before, and keep every guest's free-text dietary note,
whoever wrote it, exactly as saved. Leave every other place tags are used as it is. The couple sets tags on a guest
themselves, from the guest page, the guest table or the seating screens, working from the free-text note the guest wrote.

What the form does today, checked against the code:

1. Each guest's card shows a "Dietary needs" tag picker above the "Dietary requirements" text box. Every ticked tag has its
   own Allergy / Preference switch, so "Gluten free: allergy" with "Vegetarian: preference" can be recorded. A tag starts as
   a Preference, so a guest who ticks "Gluten free" and does not find the switch is recorded as having a preference, and the
   kitchen sheets show no allergy for them.
2. Submitting sends each guest's whole tag list, and the server makes it that guest's whole stored set, removing any stored
   tag that is not in it. The list is the one the page loaded with. If the couple change a guest's tags after a household
   opened the form, the household's save puts them back to what the form loaded.
3. The tag write sits between a guest's own details and their attendance answers. If it fails, that guest's attendance
   answers are not written and the household sees "Could not save one of the answers."
4. Loading the RSVP page reads every tag row in the wedding and keeps the household's.
5. "Other" with no words in it is dropped without a message.

## 2. Story

> **As a guest replying to the invitation**, **I want** to say what I eat in my own words, in one box, **so that** I can
> finish my reply without choosing categories.
>
> **As the couple**, **I want** to set a guest's tags myself, **so that** what the kitchen sees is what I checked.

## 3. The RSVP form

1. **One dietary field per guest:** "Dietary requirements", a single-line text box, placeholder "Vegetarian, coeliac,
   allergies — anything the kitchen should know", up to 500 characters, saved to the guest's free-text dietary note. It
   starts with the note already saved, whoever wrote it.
2. **Only for someone coming.** The field shows for a guest who is coming to at least one event; a guest who has said no to
   everything is not asked (spec 35 Q2). "Anything else we should arrange?" and every RSVP question are unchanged.
3. **No tags on any guest-facing screen.** No tag picker, no Allergy / Preference choice, and no read-only list of saved tags
   on the form, its confirmation or the reply bar.
4. **Saving never touches tags.** Saving an RSVP does not read or write the tag table. A guest's attendance, note,
   accessibility text and answers save whether or not that table is reachable, and no save removes or changes a stored tag.
5. **A form already open still saves.** A submit that carries a tag list (a page opened before the change was released) is
   accepted: the list is ignored and the rest is saved. Unknown fields are dropped, not rejected.
6. **Loading reads no tags.** The RSVP page does not query the tag table.
7. **The free-text note is never lost to this feature.** Neither the form change nor the clear in §7 writes to a guest's
   note. The form saves what is typed in the box, trimmed, and an emptied box clears the note, as for any edit. A guest who
   does not touch the box leaves the note as it was.

## 4. What stays exactly as it is

- The guest page: the tag editor with its own Save, and the free-text dietary note.
- The guest table's Dietary cell: the note, the tags under it, "Add tags" / "Edit tags".
- The seating table drawer's dietary editing.
- Everything that reads tags: chair dots, Colour by, chips, the summary bar, the print sheets, the caterer, venue and kitchen
  exports, the shared plan page, the day-link Seating module and the guest CSV.
- `guest_dietary_needs`, its migration and policies, `saveGuestDietaryNeeds`, `replaceGuestNeeds`, `src/lib/dietary.ts`, and
  `DietaryNeedsEditor` (the guest page and the guest table use it).

A guest who wrote a note and has no tags shows a grey chair dot and is listed with their note. The couple adds tags from
that guest's "Add tags". Nothing new is built for this.

## 5. Data

No migration and no schema change; `0062` stays with spec 59. The only rows deleted are the rows of `guest_dietary_needs`,
by a one-off script the planner runs by hand (§7). No statement in this feature touches the `guests` table, where the
free-text note lives.

## 6. What the build touches

Each of the first five files goes back to its content before spec 57 Part H added the picker (no other change has touched
them since), so the RSVP form's dietary fields are the form as it was.

| File | Change |
| --- | --- |
| `src/components/rsvp/rsvp-form.tsx` | The `DietaryNeedsEditor` block, the `needs` state, the `dietaryNeeds` prop, the tag list in the submit payload, the two imports. |
| `src/components/site/blocks/render.tsx` | The `dietaryNeeds` prop where `RsvpForm` is used. |
| `src/server/actions/rsvp.ts` | The `dietaryNeeds` schema field, the write block, the two imports. |
| `src/server/rsvp/resolve.ts` | The `dietaryNeeds` field of `RsvpContext`, `needsByGuest`, the `guest_dietary_needs` query. |
| `src/server/queries/site-render.ts` | `dietaryNeeds: {}` in the blank preview. |
| `supabase/tests/38_dietary_needs.sql` | One comment that says the RSVP form uses the upsert; the assertions stay (the guest page still uses it). |
| `supabase/one-off/clear_dietary_tags.sql` | New. The two steps in §7, run by hand in the Supabase SQL editor. The app never runs it. |
| `supabase/tests/40_clear_dietary_tags.sql` | New. Runs the script against seeded rows (§9). |

At build, the change also updates spec 57's Part H (§12, its build order and its Build status line, which name the RSVP
form), this spec's status, and the spec index.

## 7. The one-off clear

Empties `guest_dietary_needs`, every wedding and every guest. The tags are expected to be few or none; step 1 shows how many
there are before anything is deleted. The clear never reads or writes `guests`.

**Step 1, read-only.** Returns the number of tag rows, the number of guests who have a tag, and the number of guests with a
non-empty free-text note.

**Step 2, one transaction.** Deletes every row of `guest_dietary_needs` and returns the count. Then the same three numbers as
step 1: the tag counts are zero, and the count of guests with a note is the number step 1 gave, unchanged. If it is not, the
planner rolls back.

**What remains.** The app shows no tags. The audit log keeps a record of the saves and the deletes for its 12 months
(Settings, Activity), and the nightly backups hold the rows for 30 days. The script does not touch the audit log.

**Order.** Release the code change first, then run the script. Run first, a guest on a form that still shows the picker
could tick a tag again.

## 8. Answered (2026-11-27)

**Q1. Tags guests already saved from the RSVP form:** clear them all, as if the picker had never existed. Nobody is
expected to have used them. Folded into §5 and §7.

## 9. Verification

At build, typecheck, unit tests and `npm run build`; `./scripts/verify-migrations.sh` as a non-root user, because one SQL
test file is edited (a comment) and one is added.

- **The form is as it was:** each of the five files in §6 is identical to its content before spec 57 Part H, so a diff of
  them against that point is empty.
- **The note is untouched:** the new SQL test seeds guests with free-text notes and tag rows, runs the script, and asserts
  every note is identical afterwards and every tag row is gone.
- **The form's markup:** a static-markup test that it renders one "Dietary requirements" input and no "Dietary needs" group,
  and that the submit payload has `dietary` and no `dietaryNeeds`, if the form renders without a browser; if not, headless
  Chromium against the real form with the server action stubbed.

**Cannot be checked from a session:** a real submit against live Supabase, a real phone, a form that was open in a guest's
browser when the change went out, and the script against live data. The planner checks live: the three numbers in §7 before
and after, and, after release, their own invitation link (change a dietary answer, save, reopen: the box shows what they
saved and no tag picker appears).

**Release:** the code change is a guest-facing page on a live app. It ships as one change that only removes code, with no
database step, and goes live when it reaches `main`. The script is a separate step the planner runs after it (§7).
