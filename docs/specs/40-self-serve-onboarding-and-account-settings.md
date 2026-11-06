# Feature spec: Self-serve onboarding, and account, timezone and currency settings

**Status: questions answered (2026-11-06). Spec only — nothing built.** Asked for as
a spec after an investigation of "how do customers onboard themselves without me
running a migration". **No payment step**: that is a later spec, and §9 says what
this one leaves ready for it. All nine §10 questions are answered (see **Answered**
under §10). One went against the recommendation (Q3, 8 characters) and one was a
free answer (Q6). **Not built until the planner says to build.**

**Depends on:** V1 (`weddings`, `collaborators`), spec 3 (Settings), spec 15 §2
(`collaborators.display_name`), spec 18 (NZD only, GST), spec 25 (`site_blocks`),
spec 26 (the Today/overdue view), spec 39 (`generateLink` invite pattern,
`planner_table_access`, `v_wedding_basics`). **The planner says all migrations
through `0044` are now applied to the live project (2026-11-06).** This session
didn't check that independently. This would be `0045`.

## 1. What was asked

1. **A custom onboarding flow.** A new couple answers a short questionnaire, **sets
   a password, and goes**, with no involvement from the planner (the person who runs
   WedPlan) and no SQL editor, dashboard or migration.
2. **No payment** in this version.
3. **Settings: change names**, and **change password**.
4. **Settings: change timezone**, and every task, date and time in the app follows
   that one timezone.
5. **Settings: change currency**. Every budget is in **one** currency. No cross-currency
   support: changing it is "a simple change more than anything".

## 2. Story

Sam finds WedPlan and goes to `/start`. One page asks for their name, email and a
password, their partner's name (and optionally the partner's email), the wedding's
name, date if they know it, where it is (timezone, pre-filled from the browser) and
the currency. They press **Create our wedding** and land on the dashboard, signed
in. Their partner gets an email with a link to choose a password. Later, in
Settings, Sam fixes a misspelt name, changes their password, sees that the timezone
was wrong, corrects it (the ceremony still reads 2:00 pm), and switches the budget
from NZD to AUD. The numbers stay as they are: only the symbol changes.

## 3. How it works today (checked against the source)

- **No migration is needed per customer, even now.** The schema is multi-tenant:
  `wedding_id` and RLS on every table (`0001`/`0002`), and `seed.sql` already holds
  two weddings. A new couple is **rows**: two `auth.users`, one `weddings`, one or
  two `collaborators`, and defaults.
- **Today those rows are made by hand.** Users are added in the Supabase dashboard
  (`enable_signup = false` in `supabase/config.toml`), then `supabase/bootstrap.sql`
  is edited and pasted into the SQL editor.
- **`bootstrap.sql` only handles the first wedding.** It raises if any wedding
  exists. It also still writes the starter website to `site_content`, which the app
  has not read since `0025` (`site_blocks` replaced it; the backfill was one-time).
  **So a wedding bootstrapped today starts with an empty site.** This spec fixes
  that in passing (§5.1).
- **`weddings` has no INSERT policy, deliberately** (bootstrap.sql's header says
  why: a collaborator inserting a bare row would lose sight of it immediately). So
  creation has to run with elevated rights. That is §5.1's function.
- **Settings already has** (`src/server/actions/settings.ts`): the wedding's name,
  date, timezone (free text with a datalist), RSVP lock, invite date and reminder
  window (`updateWeddingSettings`), and **either collaborator's display name**
  (`updateCollaboratorName`).
- **Password:** only the forgot-password email flow. `/reset-password` calls
  `supabase.auth.updateUser({ password })` after a recovery link. There is no
  "change password while signed in".
- **Timezone:** `weddings.timezone`, `not null default 'Europe/London'`. Timestamps
  are shown in it. **But "today" is the UTC date**: `todayIso()` in
  `src/lib/lists/generate.ts` is used by the Today view, overdue, the calendar and
  the digest (nine call sites). HANDOFF session 32 already flags it as "wrong for NZ
  for ~12h a day". Planner-entered wall-clock times are `timestamptz`:
  `events.starts_at`/`ends_at`, `run_sheet_items.pinned_at`,
  `coach_runs.departs_at`, `coach_stops.pickup_at`, and `weddings.rsvp_lock_at`.
- **Currency:** none. Spec 18 removed it (`0019` dropped `weddings.base_currency`
  and every FX column). `formatMoney`/`formatMoneyShort` in `src/lib/format.ts`
  hardcode `en-NZ`/`NZD` (58 call sites). `GST_RATE = 0.15` in `src/lib/budget.ts`.
  Money is integer minor units throughout.

## 4. The design in one paragraph

A public `/start` page posts to one server action. It creates the login with the
Supabase **admin API** (public sign-up stays off, so the server controls who and how
fast), then calls one new database function, `create_wedding()`, which makes the
wedding, its collaborator rows and its defaults **in one transaction**, and then
signs the person in. If the partner's email was given, they get the same
set-password invite link spec 39 already sends planners. Settings gains a
**Your account** section (your name, partner's name, change password, re-send the
partner invite). Timezone becomes a proper picker, "today" is computed in the
wedding's timezone everywhere, and changing it keeps wall-clock times where they
were. Currency becomes one column on `weddings`, used by the money formatters and
nothing else: changing it never converts a number.

## 5. Onboarding

### 5.1 `create_wedding()` (in `0045`)

`public.create_wedding(p_owner uuid, p_partner uuid, p_name text, p_date date,
p_timezone text, p_currency text, p_capacity int, p_owner_name text,
p_partner_name text) returns uuid`.

- `security definer`, `set search_path = public`. `execute` is **revoked from
  public/anon/authenticated and granted to `service_role` only**, so the app can call
  it only from the server with the admin client.
- Does exactly what `bootstrap.sql` does: `weddings` row, an `owner` collaborator,
  a `partner` collaborator if `p_partner` is set (both with `display_name`),
  Ceremony and Reception events (Ceremony `is_main`), the four standard RSVP
  questions. **Starter website as `site_blocks`**, the same set the `0025` backfill
  produces, not `site_content`. The slug comes from the existing
  `weddings_default_slug` trigger.
- Raises if `p_owner` is already a collaborator on any wedding (one wedding per
  login in V1; `loadWedding` takes the first).
- **`bootstrap.sql` is rewritten to call it**, and its "first wedding only" guard
  goes. The rewrite is an edit to a script, not to a landed migration.
- SQL tests: the function makes a complete wedding that a second account can't see,
  `authenticated` can't execute it, a second call for the same owner raises, and
  the new wedding has site blocks.

### 5.2 The `/start` page

- Public (added to `PUBLIC_PREFIXES` in `src/lib/public-paths.ts`, plus its test).
  A signed-in user with a wedding is redirected to `/`. A signed-in user **without**
  one (an orphaned login) can finish here, with the account fields hidden.
- **Fields.** Only what can't sensibly be defaulted. Everything is editable later in
  Settings.

  | Field | Required | Default / note |
  | --- | --- | --- |
  | Your name | yes | becomes your `display_name` |
  | Your email | yes | the login |
  | Password, and again | yes | §10 Q3 for the rule |
  | Partner's name | no | their `display_name`, so the assign picker reads right before they join |
  | Partner's email | no | gets an invite (§5.4) |
  | Wedding name | yes | pre-filled "Sam & Alex" from the two names |
  | Wedding date | no | the countdown waits for it, as now |
  | Timezone | yes | pre-filled from the browser's `Intl…timeZone`, picker as §7 |
  | Currency | yes | NZD, picker as §8 |
  | Rough guest count | no | `capacity` |

- One page, no wizard. A short line under the button: "You can change all of this
  later in Settings."
- A hidden honeypot field. A bot that fills it gets a fake success and nothing is
  created.

### 5.3 The action: `startWedding` in `src/server/actions/onboarding.ts`

Returns `ActionResult`, like every other write. Validation lives in
`src/lib/onboarding.ts` as a zod schema with unit tests, not inline.

1. **Gates.** `ONBOARDING_OPEN` env var (unset means `/start` says "not taking new
   weddings right now"), a kill switch that needs no deploy. A per-IP throttle,
   reusing the guestbook/questions throttle pattern.
2. **Make the login.** `admin.auth.admin.createUser({ email, password,
   email_confirm })` (§10 Q2 sets `email_confirm`). **If the email already has an
   account, stop** with "That email already has a WedPlan login. Sign in instead."
   Never attach a new wedding to an existing account from a public form. That is
   the same takeover worry spec 39's planner invite guards against.
3. **Make the wedding.** If a partner email is given, create the partner's account
   first the same way spec 39 does (`generateLink({ type: "invite" })`). If that
   address already has an account, refuse the partner email with a message and let
   them continue without it. Then `admin.rpc("create_wedding", …)`.
4. **Undo on failure.** Auth and SQL can't share a transaction, so if step 3 fails
   the action deletes the auth user(s) it just made (`admin.auth.admin.deleteUser`)
   before returning the error. A unit-testable sequencing helper keeps that order
   explicit.
5. **Sign in.** `signInWithPassword` through the server client sets the session
   cookie, then redirect to `/`. The dashboard's existing empty state takes over.
6. **Partner email.** Sent with `sendEmail` (Resend), worded like the planner invite.
   Without email configured, the invite link is shown once on the dashboard
   (spec 39's fallback).

### 5.4 Partner invite, after the fact

Settings → Your account shows the partner as **Invited, not joined yet**, with
**Re-send invite** and **Change email** (until they've set a password). A partner
with no email gets **Invite your partner** (email field). Every path goes through
the same helper as §5.3 step 3. Granting a collaborator row to an account that
already existed is refused, as there.

## 6. Settings → Your account

A new section at the top of `/settings`, couple-only (it's under `/settings`,
which `CoupleOnly` already guards from planners).

- **Names.** Your name and your partner's name, inline-editable, using the existing
  `updateCollaboratorName`. The wedding's name stays in "Wedding basics", where it
  is now. Nothing new underneath; it moves to where people will look.
- **Change password.** Current password, new password, new again. New
  `changePassword` in `src/server/actions/auth.ts`: re-check the current password
  with `signInWithPassword` against the session's own email (so a borrowed unlocked
  laptop can't take the account), then `updateUser({ password })`. The rule from
  §10 Q3, shared with `/start` and `/reset-password` via `src/lib/onboarding.ts`.
  Wrong current password returns a field error. Too many wrong attempts are
  throttled. "Forgot it?" links to `/forgot-password`.
- **Your email** is shown, not editable (§11).
- **Partner invite** as §5.4.

## 7. Timezone: one timezone for everything

1. **Picker.** The free-text field becomes a `<select>` of IANA zones
   (`Intl.supportedValuesOf("timeZone")`), with Pacific/Auckland and the browser's
   own zone pinned to the top, and each option labelled with its current offset
   ("Pacific/Auckland (UTC+13)").
2. **"Today" is the wedding's today.** `todayIso()` gains a required `timeZone`
   argument (`todayIso(tz, now?)`), computed with the existing
   `src/lib/timezone.ts` helpers. All nine call sites pass `wedding.timezone`. Client
   components receive it as a prop. The digest cron computes today **per wedding**.
   Making it required, not optional, is the point: TypeScript finds every caller
   and nothing silently stays on UTC. Unit tests at the NZ edges (23:30 and 00:30
   Auckland, both sides of DST).
3. **Default for new weddings** comes from `/start` (§5.2). The column default
   `'Europe/London'` is left alone. Nothing inserts without a value any more.
4. **Changing it keeps wall-clock times** (§10 Q5, recommended). A ceremony entered
   as 2:00 pm under the wrong zone stays 2:00 pm under the right one. `0045` adds
   `change_wedding_timezone(p_wedding uuid, p_tz text)`. It is `security invoker`
   (so it runs under the caller's RLS), validates the zone against
   `pg_timezone_names`, and in one transaction rewrites every planner-entered
   wall-clock `timestamptz` (`events.starts_at`/`ends_at`, `run_sheet_items.pinned_at`,
   `coach_runs.departs_at`, `coach_stops.pickup_at`, `weddings.rsvp_lock_at`) as `(col at time zone
   old) at time zone new`, then sets `weddings.timezone`. `updateWeddingSettings`
   calls it only when the zone actually changed. **System timestamps**
   (`created_at`, `sent_at`, `viewed_at`, `done_at`, and so on) are real instants and
   are not touched. They simply display in the new zone. Dates (`due_date`,
   `wedding_date`) are dates and don't move. A SQL test pins all three.
   Build step 1 re-greps the schema for any other planner-entered `timestamptz`.
5. The field gets one line of help: "Changing this keeps your times as typed
   (2:00 pm stays 2:00 pm)."

## 8. Currency: one currency, a label not a conversion

1. **Schema (`0045`).** `weddings.currency text not null default 'NZD'` with a check
   `currency ~ '^[A-Z]{3}$'` (§10 Q6). Every existing wedding is NZD, so nothing changes
   for them. `v_wedding_basics` (spec 39's planner view) gets the column, recreated
   with it appended. The planner sees no money, but the view should not silently
   lag the table.
2. **Formatting.** `formatMoney(minor, currency)` and `formatMoneyShort(minor,
   currency)` take a **required** currency, for the same reason as `todayIso`. The
   locale stays `en-NZ` (so USD prints "US$1,200.00", unambiguous). The 58 call
   sites pass `wedding.currency`; the public site and registry read it from the
   wedding they already load. Mechanical, but it touches many files: it's the
   largest part of this spec by line count.
3. **Any currency, symbol only (Q6).** The picker offers every code
   `Intl.supportedValuesOf("currency")` knows, with NZD, AUD, USD, GBP, EUR and CAD
   pinned to the top. The check constraint is just "three uppercase letters". The
   app validates against the `Intl` list. **Decimals don't follow the currency:**
   amounts are stored and shown in hundredths exactly as now, whatever the code.
   The formatters force their fraction digits (`formatMoney` always 2,
   `formatMoneyShort` 0 or 2 as today) rather than taking the currency's own
   convention. So a JPY wedding reads "¥4,600.00", and no stored number changes
   meaning.
4. **Changing it converts nothing.** The setting's help text says so in plain words:
   "This changes the symbol only. Amounts are not converted." Changing it is an
   ordinary `updateWeddingSettings` field, audited like the rest of `weddings`.
5. **GST.** Unchanged, recommended (§10 Q7): the inclusive/exclusive toggle and its
   15% stay as spec 18 built them, whatever the currency. Simplest, and it is a tax
   rule, not a currency.
6. **Known NZ-only corners left as they are** (§11): the bank-details account-number
   check (15–16 digit NZ format, `0033`) and the registry's paste-a-link price
   autofill (reads NZD prices only, so with another currency it just leaves the
   price blank to type).

## 9. Ready for payment later (not built here)

The later payment spec puts a Stripe Checkout step between §5.3's validation and
step 2, and moves steps 2–6 into the webhook. This spec keeps that a small change:
`create_wedding()` is already the one server-only entry point, sign-up is already
server-controlled, and `ONBOARDING_OPEN` already gates the public door. Nothing
here adds a `plans`/`subscriptions` table or a price.

## 10. Open questions — none answered; the first option is the recommendation

1. **Who may sign up?** (a) Anyone, behind `ONBOARDING_OPEN`, a throttle and a
   honeypot. (b) Only with an invite code you hand out. (c) Anyone, but new
   weddings wait for your approval. *(a) matches "without any interaction"; (b) is
   a cheap middle ground while it's unproven in a browser.*
2. **Email confirmation?** (a) Go straight in ("set a password and go"), and send a
   welcome email that isn't required to click. (b) Must click a link before first
   sign-in. *(a) is what was asked. The cost is that a mistyped email means no
   password reset later, and someone could register an address that isn't theirs.*
3. **Password rule.** (a) At least 10 characters, nothing else. (b) 8 characters.
   (c) Supabase's own policy plus leaked-password check (a dashboard setting).
4. **Partner at signup.** (a) Name optional, email optional, invite sent if given.
   (b) Name and email both required. (c) Leave the partner entirely to Settings.
5. **Timezone change and existing times.** (a) Keep wall-clock times, so 2 pm stays
   2 pm (§7.4). (b) Keep the instants, so 2 pm London becomes 1 am Auckland, with
   just a warning. *(a) is almost always what a correction means; (b) needs no new
   function.*
6. **Which currencies?** (a) NZD, AUD, USD, GBP, EUR, CAD. (b) Every ISO currency
   with two decimals. (c) Add FJD/WST/TOP for Pacific weddings to (a).
7. **GST when the currency isn't NZD.** (a) Leave it: same toggle, 15%. (b) Hide
   the toggle unless NZD (existing "exclusive" lines keep their uplift). (c) A
   per-wedding tax rate and label — a bigger change.
8. **Where does `/start` live?** (a) `/start` on the app's own domain. (b) A marketing
   site that links to it (separate work, not this spec).
9. **Changing the login email** from Settings — leave out (§11), or include? It
   needs Supabase's email-change confirmation round trip, so it isn't a one-liner.

### Answered (2026-11-06)

| Q | Answer |
| --- | --- |
| 1 | **(a) Anyone**, behind `ONBOARDING_OPEN`, a throttle and a honeypot. |
| 2 | **(a) Go straight in.** `email_confirm: true` on `createUser`; the welcome email isn't required. |
| 3 | **(b) 8 characters minimum**, nothing else. *Against the recommendation of 10.* The one rule is shared by `/start`, change password and `/reset-password`. |
| 4 | **(a) Partner name and email both optional**; the invite is sent if an email is given. |
| 5 | **(a) Keep wall-clock times** (§7.4, `change_wedding_timezone()`). |
| 6 | **Free answer: "It's just a sign, no conversion, so decimals don't matter."** Any currency, symbol only, always hundredths (§8.3). |
| 7 | **(a) Leave GST as is**: same toggle, 15%, whatever the currency. |
| 8 | **(a) `/start`** on the app's own domain. |
| 9 | **Leave out** changing the login email. |

## 11. Not in scope

- Payment, plans, trials, invoices (the next spec, §9).
- Converting amounts, FX, more than one currency per wedding (spec 18 stands).
- Following a currency's own decimal convention (Q6: always hundredths).
- Changing the login email, deleting an account or a wedding (the "no destructive
  writes to guest data" rule makes that its own design).
- One login on several weddings (V4, per `loadWedding`'s own comment).
- Social sign-in, magic links, two-factor.
- Making the bank-details check or the registry price autofill currency-aware.
- A marketing/landing site.

## 12. Build order (once §10 is answered and building is asked for)

1. Re-grep the schema for planner-entered `timestamptz` columns; confirm §7.4's list.
2. `0045`: `weddings.currency`, `create_wedding()`, `change_wedding_timezone()`,
   `v_wedding_basics` recreated. SQL tests. Rewrite `bootstrap.sql` to call
   `create_wedding()`. `supabase/migrations/README.md` row. No new table, so
   `planner_table_access` is unchanged, but its pinning test is run.
3. `src/lib/onboarding.ts` (schema, password rule, undo sequencing) with tests.
4. `todayIso(tz)` and its nine callers, plus the digest's per-wedding today. Tests.
5. `formatMoney(minor, currency)` and its callers.
6. `startWedding` action, `/start` page, public path, `ONBOARDING_OPEN` in
   `src/lib/env.ts`.
7. Settings: Your account (names, change password, partner invite), timezone
   picker, currency picker.
8. Typecheck, unit tests, `verify-migrations.sh`, `verify-bootstrap.sh`, `next build`.

## 13. Risks

- **Open sign-up is a public write path that creates accounts.** The throttle, the
  honeypot and the kill switch are the whole defence in (a). Turn it on only after
  the cross-wedding isolation has been seen to hold with two real accounts in a
  browser, which has never happened (`docs/HANDOFF.md`).
- **Email has to work** for the partner invite. The sending domain
  (SPF/DKIM/DMARC) is still not set up. The one-time link on the dashboard is the
  fallback.
- **`0045` assumes the live project has everything through `0044`** (the planner
  says it does). `create_wedding()` writes to `site_blocks` and `events.is_main`, so
  run `node scripts/verify-live.mjs` before applying it.
- **The currency change touches ~58 call sites.** That's mechanical, but it's the
  part most likely to miss a screen. The required parameter is what catches it.
