# Feature spec: The RSVP form asks for dietary needs in one free-text box; tags are the couple's to set

**Status: answered 2026-11-27, not built. The build waits for "build it".**

**Depends on:** spec 57 (Part H: the dietary tags, and the guest page, guest table, table drawer and seating screens that
read them), spec 35 (the RSVP form in the site theme: a guest who is not coming is not asked about food). **No migration.**

## 1. What was asked

The RSVP form is live: guests reply, and come back to change their answers. Spec 57 Part H put a tag picker on it. Take the
picker off the guest-facing form and leave every other place tags are used exactly as it is. The couple sets tags on a guest
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

No migration and no schema change; `0062` stays with spec 59. The only rows deleted are the planner's wedding's tags that
a guest saved from an RSVP link, by a one-off script the planner runs by hand (§7). Every other row, in this wedding and in
any other, stays. A guest's free-text note is never changed.

## 6. What the build touches

Removed from the RSVP side only:

| File | Change |
| --- | --- |
| `src/components/rsvp/rsvp-form.tsx` | The `DietaryNeedsEditor` block, the `needs` state, the `dietaryNeeds` prop, the tag list in the submit payload, the two imports. |
| `src/components/site/blocks/render.tsx` | The `dietaryNeeds` prop where `RsvpForm` is used. |
| `src/server/actions/rsvp.ts` | The `dietaryNeeds` schema field, the write block, the two imports. |
| `src/server/rsvp/resolve.ts` | The `dietaryNeeds` field of `RsvpContext`, `needsByGuest`, the `guest_dietary_needs` query. |
| `src/server/queries/site-render.ts` | `dietaryNeeds: {}` in the blank preview. |
| `supabase/tests/38_dietary_needs.sql` | One comment that says the RSVP form uses the upsert; the assertions stay (the guest page still uses it). |
| `supabase/one-off/clear_rsvp_dietary_tags.sql` | New. The two-step script in §7, run by hand in the Supabase SQL editor. The app never runs it. |
| `supabase/tests/40_clear_rsvp_dietary_tags.sql` | New. Runs the script's rule against seeded rows (§9). |

With the change, the RSVP form's dietary fields match the form as it was before spec 57 Part H added the picker.

At build, the change also updates spec 57's Part H (§12, its build order and its Build status line, which name the RSVP
form), this spec's status, and the spec index.

## 7. The one-off clear

Removes the tags guests saved from the RSVP form in the planner's wedding. A guest-saved tag is told apart from one the
couple set by the audit log, which records whether each write came from a signed-in planner or from a guest on their link.

**Which rows.** A tag row in one wedding, the id of which is set at the top of the script, whose most recent insert or
update in the audit log was by a guest (`actor_kind = 'public'`). A tag whose most recent write was by a planner stays, as
does a tag with no audit record. A tag the couple set and a guest's save later changed counts as the guest's; the audit log
holds the earlier value. No other wedding is touched: its couple can edit or clear its tags on the guest page.

**Step 1, read-only.** Lists each affected guest: name, their tags with allergies marked, and whether they have a free-text
note, with a count. A guest with an allergy tag and no note is a guest whose allergy would be recorded nowhere after step 2.
The planner types it into the note, or asks the guest, before running step 2.

**Step 2, one transaction.** Deletes exactly those rows and reports the count. The planner commits only if the count equals
step 1's.

**What remains.** The app shows none of it: not on the guest page, the seating screens or the exports. The audit log keeps a
record of the saves and the deletes for its 12 months (Settings, Activity), and the nightly backups hold the rows for 30
days. The script does not touch the audit log.

**Order.** Release the code change first, then run the script. Run first, a guest on the form that still shows the picker
could tick a tag again.

## 8. Answered (2026-11-27)

**Q1. Tags guests already saved from the RSVP form:** clear them, as if the picker had never existed. Folded into §5 and §7:
the clear covers the planner's wedding and the tags guests saved, and leaves tags the couple set.

## 9. Verification

At build, typecheck, unit tests and `npm run build`; `./scripts/verify-migrations.sh` as a non-root user, because one SQL
test file is edited (a comment) and one is added. A static-markup test that the RSVP form renders one "Dietary requirements"
input and no "Dietary needs" group, and that the submit payload has `dietary` and no `dietaryNeeds`, if the form renders
without a browser; if not, headless Chromium against the real form with the server action stubbed. The new SQL test seeds
tag rows with audit entries written as a guest and as a planner, in two weddings, and asserts the script removes only the
guest-written rows of the named wedding and keeps a planner-written row, a row with no audit entry and the other wedding's
rows.

**Cannot be checked from a session:** a real submit against live Supabase, a real phone, a form that was open in a guest's
browser when the change went out, and the script against live data. After release, open your own invitation link, change a
dietary answer, save, and reopen: the box shows what you saved and no tag picker appears.

**Release:** the code change is a guest-facing page on a live app. It ships as one change that only removes code, with no
database step, and goes live when it reaches `main`. The script is a separate step the planner runs after it (§7).
