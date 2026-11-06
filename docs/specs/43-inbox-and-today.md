# Feature spec: Inbox and Today — one place for what guests send you, and a home screen that says what's next

**Status: proposal, not built.** Written 2026-11-06 from a discovery pass over the code.
Nothing here is authorised to build until §9's questions are answered and the planner says to
build it.

**Depends on:** spec 41 (the shell), spec 26 (overdue on Today), spec 34 (song requests), spec 36
(registry claims), spec 37 (guest questions), spec 29 ("can't come").

## 1. What was asked

Part of the same discovery: make it obvious where things are and what to do next.

## 2. Story

Sam opens WEDPLAN. **Today** says: "3 tasks overdue · Payment to the caterer due Friday · 12
households have a save the date but no invitation · 2 new guest questions." Each line is a link.
The sidebar shows **Inbox 5**. Inbox lists everything guests have sent in, newest first, in one
list: two questions, a song request, a guestbook note, a registry claim. Sam answers one question
and approves the song, and the badge drops to 3.

## 3. What's there now

- **Overview** (`src/app/(planner)/page.tsx`, "Where things stand") is grids of `Stat` tiles:
  Tasks, Budget, Registry, Responses, Capacity, Invitations. Every number links to its list, which
  is a good rule to keep. **It doesn't say what to do next**, and it doesn't count guest questions,
  song requests or guestbook entries.
- **What guests send in lives in four places:**
  - guest questions: `/site/questions`, status `new` / answered / dismissed (spec 37);
  - song requests and guestbook: Website → "Elsewhere", with approve/played states (specs 14, 34);
  - registry claims: `/gifts/claims`, with "new since you last looked" (spec 36);
  - "can't come" notes: `/invitations?status=unable` (spec 29).
- **A planner login** has its own `PlannerOverview` and must keep it.

## 4. The proposal

### 4.1 Inbox (`/inbox`)

- **One list, newest first**, mixing the four sources. Each row has the kind (Question · Song ·
  Guestbook · Registry · Can't come), who, a one-line preview, when, and its own actions inline
  (Answer / Dismiss, Approve, Mark thanked…). These reuse the existing server actions; nothing is
  rewritten.
- **Filter** with a segmented control: All · Needs you · Questions · Songs · Guestbook · Registry.
  The filter is in the URL (`/inbox?kind=songs`).
- **"Needs you"** is decided by each source's own state: a question, song request or guestbook note
  still in status `new` (`guest_questions`, `song_requests`, `guest_notes`), a claim the couple hasn't looked at, a can't-come not yet seen.
- **Sidebar badge** is the "Needs you" count.
- The existing pages (`/site/questions`, `/gifts/claims` and so on) stay as deep views; Inbox
  links into them.
- **Couple only**: `inbox` goes in `COUPLE_ONLY_ROUTES`, like the screens it reads.

### 4.2 Today (`/`)

Two parts, top to bottom:

1. **Next up.** Up to six short sentences, each a link, chosen by a pure function from data the
   overview already loads, in this priority: overdue tasks, payments due in the next 7 days, Inbox
   "needs you", journey gaps (spec 42: households with a save the date but no invitation;
   invitation opened but no reply after 14 days), over capacity, RSVP lock in under 14 days.
   When nothing's due: "Nothing needs you today."
2. **Where things stand.** Today's tiles, unchanged, under a smaller heading. Every number still
   links to its list.

`PlannerOverview` stays as is for a planner login.

## 5. Not in scope

- Email or push notifications for new Inbox items.
- Replying to a guest from Inbox (questions are private to the couple; see spec 37).
- Changing what any source stores.

## 6. Data

- **Questions, songs, guestbook**: their existing `status = 'new'` decides "needs you". No
  migration.
- **Registry claims** already track "since you last looked".
- **Can't come**: there's no "seen" flag today. See Q2. Recommended: no flag; show the ones from
  the last 14 days.
- **Expected: no migration**, unless Q2 is answered "track seen". That would need one column
  (`invitation_responses.unable_seen_at` or similar), audited like the rest.

## 7. Files (expected)

- `src/server/queries/inbox.ts` (new, `cache()`): one query per source, merged.
- `src/lib/inbox.ts` (new, pure): merge, sort, "needs you", filter. Unit-tested.
- `src/lib/today.ts` (new, pure): the Next-up sentences and their priority. Unit-tested,
  timezone-aware via `todayIso(timeZone)` (spec 40).
- `src/app/(planner)/inbox/page.tsx` + `layout.tsx` (`CoupleOnly`), `planner-routes.ts` entry.
- `src/app/(planner)/page.tsx`: Next up above the tiles.

## 8. Test plan

- Unit: `inbox.ts` merge/sort/filter; "needs you" per kind; badge count equals the "Needs you" list
  length.
- Unit: `today.ts`: each rule triggers on its own; priority order; cap of six; the empty state;
  dates in the wedding's timezone.
- Unit: `planner-routes.test.ts` passes with `inbox` added.
- Headless Chromium at 1280 and 390, with sample data.
- typecheck, test, build.

## 9. Open questions

| Q | Question | Recommendation |
| --- | --- | --- |
| 1 | Which kinds go in Inbox? Questions, songs, guestbook, registry claims, can't come? | **All five.** |
| 2 | "Can't come": track seen, or show the last 14 days? | **Last 14 days, no migration.** |
| 3 | Next up: cap at six lines? | **Yes.** |
| 4 | Keep the full tile grid on Today under Next up? | **Yes, unchanged.** |
| 5 | Sidebar badge counts "Needs you" only? | **Yes.** |
