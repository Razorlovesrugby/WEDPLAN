# Feature spec: The RSVP form has no dietary tag picker

**Status: built (see Build status). No migration.**

**Depends on:** spec 57 (Part H: dietary tags for the seating plan), spec 35 (the RSVP form in the site theme).

## 1. What was asked

- The tags are for the seating plan: seeing food needs and, later, giving each guest a meal. They are the couple's tool.
- Guests are not asked for tags. The RSVP form keeps its one free-text dietary box.
- No guest has saved a tag (checked by the planner against the live database, 2026-11-27), so nothing is cleared.

## 2. The RSVP form

- One dietary field per guest: "Dietary requirements", a single-line text box, placeholder "Vegetarian, coeliac, allergies —
  anything the kitchen should know", up to 500 characters, saved to the guest's free-text dietary note. It starts with the
  note already saved.
- It shows for a guest who is coming to at least one event; a guest who has said no to everything is not asked (spec 35 Q2).
- No tag picker, no Allergy / Preference choice, no list of saved tags on the form, its confirmation or the reply bar.
- Saving an RSVP does not read or write the tag table, and loading the page does not read it.
- A form opened before this change that still sends tags is accepted: the tags are ignored and the rest is saved.
- The free-text note is not written by anything in this change. An emptied box clears the note, as for any edit.

## 3. What stays as it is

- Tags on the guest page, in the guest table's Dietary cell and in the seating table drawer.
- Everything that reads tags: chair dots, Colour by, chips, exports, the day-link Seating module, the guest CSV.
- The `guest_dietary_needs` table, `saveGuestDietaryNeeds`, `replaceGuestNeeds` and `DietaryNeedsEditor`. The editor's
  `legendClass`, `inputClass` and `help` props were added for the RSVP form and are unused; they stay.

## 4. Not in this spec

- Offering tags to guests, or choosing a meal per guest, is a separate spec. The tag list today is vegetarian, vegan, gluten
  free, dairy free, tree nuts, peanuts, shellfish, fish, egg, soy, sesame, halal, kosher and other. It has no pescatarian.

## 5. Build status

- **Done:** `rsvp-form.tsx`, `render.tsx`, `actions/rsvp.ts`, `rsvp/resolve.ts` and `queries/site-render.ts` are back to their
  content before spec 57 Part H; no other change had touched them. Spec 57 and HANDOFF no longer say the RSVP form has tags.
- **Verified:** typecheck, 1897 unit tests, `npm run build`. The SQL suite was not run: no SQL changed.
- **Not verified:** the form in a browser or on a phone, a submit against live Supabase, a form that was open in a guest's
  browser during the release.
- **Live when:** the change reaches `main`. This branch is not merged.
