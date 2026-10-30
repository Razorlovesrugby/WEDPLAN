# Feature spec: "Ask a question", a registry button, and no More/Less on the timeline

**Status: built (2026-10-30) — asked for as three small changes, no spec first;
this spec is written after the fact, at the planner's request, to record what
was decided and built.** On branch `claude/site-registry-button-and-timeline`,
PR #76. **Never opened in a browser, never run against Supabase; migration
`0040` is not applied to the live project.**

**Depends on:** spec 14/23 (the site and its blocks), spec 21 (a household's own
link), spec 25 §12 (the guestbook, whose action this one copies), spec 28 §5.3
(the event note), spec 36 (the registry page), spec 32 (a new table is audited).
**`0026`–`0039` are not applied to the live project** (`docs/HANDOFF.md`); this
is `0040` and stacks on them.

## 1. What was asked

From a screenshot of the household page's timeline, three things:

1. "Add the *ask a question* button functionality on the site."
2. "Add a link to the registry in the gifts section — just a button with a link
   that'll take you there."
3. "On the timeline it has a less and more button … can you just remove it, it
   doesn't actually minimise much."

## 2. Decisions

| # | Question | Answer |
| --- | --- | --- |
| 1 | Where is the "Ask a question" button? | **It did not exist.** Not in the code, not in git history; the FAQ block was a plain list. "Functionality" therefore meant building it. |
| 2 | What should it do? | Put to the planner as three options (email, a form that lands in the planner, WhatsApp). **Answered: the form** ("2. Plz"). |
| 3 | Email the couple on a new question? | **No** ("I don't need an email"). They read it in the inbox. |
| 4 | Where does the registry button go? | The gifts block, beside **Contribute**. Links to `/registry/<wedding slug>`, spec 36's page, not an outside shop. |
| 5 | What if the registry is off? | The button does not appear (a switched-off registry 404s, so a link would be a dead end). |

## 3. What was built

**A. Timeline More/Less removed.** `EventNote` (`src/components/site/event-note.tsx`)
is a plain paragraph. It used to clamp a long note to three lines, measure it in
the browser, and offer More/Less; all of that, and its `"use client"`, is gone.
Notes are always shown in full.

**B. "View our registry" button.** `GiftFunds` takes `registryHref`.
`getPublicSiteExtras` reads `registry_settings.enabled` into
`SiteExtras.registryEnabled` (an error reads as off), and the renderer builds
the href from `ctx.wedding.slug`. A gifts block with a registry but no funds and
no bank details now renders (it used to return nothing). Same button styling as
Contribute.

**C. "Ask a question".** A button under the FAQ block (`ask-question.tsx`) that
opens a small form in place: the question (1000 characters), a name (not asked
on a household's own link — the household's name is used), and an optional email
or phone for a reply.

- **Private.** A question is shown to nobody but the couple. There is no
  `arrivalStatus()`, no approved rung and no moderation; this is deliberately
  *not* the guestbook, which publishes.
- **`0040_guest_questions.sql`.** `guest_questions` (`wedding_id`, optional
  `household_id`, `author_name`, `contact`, `body`, `status`). Status is
  `new → answered | dismissed`. Body non-empty and ≤ 1000, contact ≤ 200 (checked
  in the database, not only the form). RLS on, forced, `anon` revoked.
  **Audited**, with `contact` redacted. Tested in
  `supabase/tests/22_guest_questions.sql` (8 assertions).
- **`askQuestion`** (`src/server/actions/questions-inbox.ts`, named so because
  `questions.ts` is the RSVP questions). Copies the guestbook action: the slug is
  the only thing the browser controls; the household comes from the token, never
  from an id the browser sends; the same IP throttle (`isThrottled`).
- **Planner inbox at `/site/questions`**, linked under "Elsewhere" in the site
  editor: Waiting / answered / dismissed / all, "Mark answered", "Dismiss",
  "Delete" (a real delete, like a guestbook note; the audit log keeps what was
  asked).
- **Preview.** In the editor's preview the form works and refuses to send
  (`PREVIEW_NOT_SAVED`), like every other form on the site.

## 4. Verification

- **Ran:** `npm run typecheck`; `npm test` (1184, unchanged count — no unit test
  was added); `./scripts/verify-migrations.sh` (664 assertions, 8 new);
  `npm run build` with placeholder env (it needs `INVITE_TOKEN_PEPPER`,
  `CRON_SECRET` and `NEXT_PUBLIC_SITE_URL` set too, or page-data collection fails
  on "Invalid client environment").
- **Not done:** anything in a browser; anything against a live Supabase; the form
  has never sent a question; the throttle was not exercised; the button's look on
  a phone, or on a dark or photograph background, has not been seen.
- No unit tests were written for the new action or components, in line with how
  the guestbook's action is covered (by the SQL suite and the build).

## 5. Left, deliberately

- **No notification.** A question sits in the inbox until the couple look. A
  dashboard tile (spec 36 Q9's precedent) is the cheap next step if wanted.
- **No switch.** The button always shows under a FAQ block; there is no per-block
  toggle to hide it. Not requested.
- **No reply from the planner.** "Mark answered" is a status, not a message; the
  couple answer by hand using the contact the guest left, if any.
- **A question with no contact** can only be answered in person or by adding it to
  the FAQ. The inbox says so.
- **The registry button is not shown on the registry-less site by accident** — it
  needs `registry_settings.enabled`; a registry that is switched on but empty still
  shows the button.

## 6. Pick up here

1. Apply `0026`–`0040` to the live project in order, then merge PR #76 and let
   Vercel deploy. **Without `0040`, a guest sending a question sees "We couldn't
   send that."**
2. On a phone, on a household's own link: open the FAQ, press **Ask a question**,
   send one, then open `/site/questions` and mark it answered.
3. Do the same from the shared address (name field shows) and in the editor's
   preview (refuses to send).
4. Gifts section: switch the registry on and off in `/gifts` and check the button
   appears and disappears; tap it and land on `/registry/<slug>`.
5. Open a household page with a long event note: it should show in full, no
   More/Less.
