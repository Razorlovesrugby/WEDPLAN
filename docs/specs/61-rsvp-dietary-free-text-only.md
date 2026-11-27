# Feature spec: The RSVP form asks for dietary needs in one free-text box; tags are the couple's to set

**Status: proposed, not built. §7 has one question. Answering it is not a build request: the build waits for "build it".**

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

No migration; `0062` stays with spec 59. No row is deleted or changed. Tags a guest saved from the RSVP form stay on that
guest, appear on the guest page and the seating screens, and the couple can edit or clear them. The table does not record
whether a tag came from a guest or the couple, so the two cannot be told apart afterwards (§7 Q1).

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

With the change, the RSVP form's dietary fields match the form as it was before spec 57 Part H added the picker.

At build, the change also updates spec 57's Part H (§12, its build order and its Build status line, which name the RSVP
form), this spec's status, and the spec index.

## 7. Open question

**Q1. Tags guests already saved from the RSVP form.** Leave them where they are, or clear them?
*Recommendation: leave them.* They are guest data, the couple sees them on the guest page and can change any of them, and
clearing would also remove tags the couple set themselves, since the two can't be told apart. If you would rather start
clean, say so and this spec will name what to clear.

## 8. Verification

At build, typecheck, unit tests and `npm run build`; `./scripts/verify-migrations.sh` because a SQL test file is edited
(comment only), run as a non-root user. A static-markup test that the RSVP form renders one "Dietary requirements" input and
no "Dietary needs" group, and that the submit payload has `dietary` and no `dietaryNeeds`, if the form renders without a
browser; if not, headless Chromium against the real form with the server action stubbed.

**Cannot be checked from a session:** a real submit against live Supabase, a real phone, and a form that was open in a
guest's browser when the change went out. After release, open your own invitation link, change a dietary answer, save, and
reopen: the box shows what you saved and no tag picker appears.

**Release:** this is a guest-facing page on a live app. It ships as one change that only removes code. There is no database
step, so the order of release does not matter. It goes live when it reaches `main`.
