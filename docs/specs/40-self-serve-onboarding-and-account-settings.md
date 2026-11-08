# Feature spec: Self-serve onboarding, and account, timezone and currency settings

**Status: built (2026-11-06), branch `claude/confident-fermat-eali50`, no PR. `0045` is
applied to the live project (planner, 2026-11-08).** This document describes **what was built**, so it can be checked
against the code. History: asked for as an investigation, then as a spec; nine questions were put
and answered (§10); then "Build the spec out". The planner later said that turn meant "finish
the spec", not "build it", but chose to keep the build and asked for this document to match it
exactly. **§12 lists the parts that go beyond the bare minimum asked for**, so they can be cut.

**Depends on:** V1 (`weddings`, `collaborators`), spec 3 (Settings), spec 15 §2
(`collaborators.display_name`), spec 18 (budget, GST), spec 26 (Today/overdue), spec 39
(`generateLink` invite pattern, `v_wedding_basics`). The planner says every migration through
`0044` is applied to the live project; this session didn't check that.

## 1. What was asked

1. **Onboarding without the planner.** A couple answers a short questionnaire, **sets a
   password, and goes**. No SQL editor, dashboard step or migration per customer.
2. **No payment** in this version.
3. **Settings: change names** and **change password**.
4. **Settings: change timezone.** Every task, date and time follows the one timezone.
5. **Settings: change currency.** One currency per wedding, a simple change. No conversion,
   no cross-currency.

## 2. Story

Sam goes to `/start`, fills in one page (their name, email, password, partner's name and email,
wedding name, date, guest count, timezone, currency) and presses **Create our wedding**. They
land on the dashboard, signed in. Alex, their partner, gets an email with a link to choose a
password. Later, in Settings, Sam fixes a name, changes their password, corrects the timezone
(the ceremony still reads 2:00 pm) and switches the budget from NZD to AUD. The numbers stay the
same; only the symbol changes.

## 3. Why no migration is needed per customer

The schema is already multi-tenant: `wedding_id` and RLS on every table. A new couple is
**rows**, not schema: logins, one `weddings` row, `collaborators` rows, defaults. Before this
spec those rows were made by hand (Supabase dashboard, then pasting `supabase/bootstrap.sql`
into the SQL editor, which only worked for the first wedding). `weddings` has no INSERT policy
on purpose, so creating one needs elevated rights. That's what `create_wedding()` provides.

## 4. The database: migration `0045_onboarding_timezone_currency.sql`

One migration, applied once. No new table.

### 4.1 `weddings.currency`

`text not null default 'NZD'`, check `currency ~ '^[A-Z]{3}$'`. Existing weddings become NZD,
which is what they already showed. `v_wedding_basics` (spec 39's planner view) is recreated with
the column appended.

### 4.2 `create_wedding()`

`create_wedding(p_owner, p_partner, p_name, p_date, p_timezone, p_currency, p_capacity,
p_owner_name, p_partner_name) returns uuid`.

- **SECURITY INVOKER, executable by `service_role` only** (revoked from public, anon,
  authenticated). The service role bypasses RLS, so it can insert the wedding row. Same shape
  as `claim_registry_item()`.
- In one transaction it makes:
  - the `weddings` row (the slug comes from the existing trigger);
  - an `owner` collaborator, and a `partner` collaborator if `p_partner` is given, each with a
    display name;
  - Ceremony (marked `is_main`) and Reception events;
  - the four standard RSVP questions (the built-in decline note comes from `0023`'s trigger).
- **No website rows.** The site builder's empty state already offers the starter layouts.
- It refuses:
  - a login that already has a wedding (one wedding per login, since `loadWedding` takes the
    first);
  - the same login as owner and partner;
  - an unknown timezone.
- **`bootstrap.sql` now calls it.** The "first wedding only" guard is gone, so the SQL route
  works for any couple.

### 4.3 `change_wedding_timezone(p_wedding_id, p_timezone)`

- SECURITY INVOKER, so it runs under the caller's RLS. Executable by `authenticated`.
- In one transaction it rewrites every planner-entered wall-clock time so it reads the same in
  the new zone (`(col at time zone old) at time zone new`), then sets `weddings.timezone`. The
  columns are:
  - `weddings.rsvp_lock_at`
  - `events.starts_at` and `ends_at`
  - `run_sheet_items.pinned_at`
  - `coach_runs.departs_at`
  - `coach_stops.pickup_at`
  - `seating_plans.reveal_at`
- System timestamps (`created_at`, `done_at`, `sent_at`, `paid_at`, and so on) are real instants
  and don't move. Dates (`due_date`, `wedding_date`) don't move either.

### 4.4 SQL tests (`supabase/tests/26_onboarding.sql`, 30 assertions)

- Currency: the default, and bad codes refused.
- `create_wedding`:
  - signed-in and anon users can't call it;
  - it makes everything listed in §4.2;
  - it refuses a second wedding and an unknown timezone;
  - the new couple see only their wedding, and another couple and a stranger see none of it.
- `change_wedding_timezone`:
  - a stranger can't call it on someone else's wedding;
  - ceremony, RSVP lock, coach and stop keep their typed times;
  - a `done_at` doesn't move.

## 5. Onboarding: `/start`

### 5.1 The page (`src/app/start/`)

- **Public** (`/start` added to `PUBLIC_PREFIXES`).
  - A signed-in person who already has a wedding is redirected to `/`.
  - A signed-in person **without** one fills in the same page with the account fields hidden.
- **Closed unless `ONBOARDING_OPEN=true`** (environment variable; in `.env.example`). When
  closed, the page says "Not taking new weddings right now" and links to sign in.
- **One page, these fields:**

  | Field | Required | Note |
  | --- | --- | --- |
  | Your name | yes | your display name |
  | Email | yes | the login |
  | Password, and again | yes | at least 8 characters |
  | Partner's name | no | their display name (only stored if an email is given too) |
  | Partner's email | no | they get a set-password invite |
  | Wedding name | yes | fills itself as "Sam & Alex" from the two names until typed over |
  | Date | no | |
  | Rough guest count | no | `capacity` |
  | Timezone | yes | dropdown, defaults to the browser's own zone (Pacific/Auckland if unknown) |
  | Currency | yes | dropdown, NZD selected |

- A hidden "website" field (honeypot): if it's filled in, the action reports success and
  creates nothing.
- Links: `/login` shows "New here? Set up your wedding" when sign-ups are open, and `/setup`
  (signed in, no wedding) links to `/start`.

### 5.2 The action: `startWedding` (`src/server/actions/onboarding.ts`)

Validation rules are in `src/lib/onboarding.ts` (zod, unit-tested). Steps:

1. **Gate.** If `ONBOARDING_OPEN` isn't on, refuse. If the honeypot is filled, report success
   and stop. If the person is signed in and already has a wedding, refuse.
2. **Throttle.** At most 5 attempts per IP address an hour. It counts in the existing
   `rsvp_token_attempts` table under a separate `start:` key, so it never affects guests' RSVPs.
3. **Validate** the fields. Errors show next to each field.
4. **Owner login.** `auth.admin.createUser` with the password and `email_confirm: true`, so
   there's no confirmation email to click (Q2). **If the email already has a login, stop** with
   "That email already has a WedPlan login. Sign in instead." It never attaches a wedding to an
   existing account from a public form. Supabase public sign-up stays off.
5. **Partner login**, if an email was given: `generateLink({ type: "invite" })`, the same way
   spec 39 makes a planner's login. If that address already has a login, stop with a message
   telling them to leave it blank and invite their partner later from Settings.
6. **Wedding.** `create_wedding()` via the service role.
7. **Undo on failure.** If step 5 or 6 fails, delete the logins this call made.
8. **Sign in** with the new password, which sets the session cookie, and go to `/`.
9. **Partner email** via the existing Resend sender. If email isn't configured, the one-time
   link is shown on the `/start` screen before continuing, so it isn't lost.

## 6. Settings → Your account

A new section at the top of `/settings` (couple-only, like the rest of Settings).

- **Names:** both collaborators' names, inline-editable. This is the existing editor, moved here
  from its own "Names" section. The wedding's name stays in Wedding basics.
- **Your login:** your email is shown, not editable (Q9).
- **Change password** (`changePassword` in `src/server/actions/auth.ts`):
  - fields for current, new, and new again;
  - the current password is checked first, so someone at an unlocked laptop can't take the
    account;
  - 5 wrong tries per 15 minutes, then a wait;
  - the new password must be at least 8 characters, the same rule as `/start` and
    `/reset-password`;
  - a "Forgot it?" link goes to `/forgot-password`.
- **Your partner** (`src/server/actions/partner.ts`):
  - **No partner yet:** an "Invite your partner" form (name and email). It makes their login,
    adds them as the partner, and emails the link.
  - **Invited, not joined yet:** buttons for **Re-send invite** and **Change email** (fixes a
    typo, then sends to the new address).
  - **Joined:** shows that, with no buttons. "Joined" means they've signed in at least once.
  - If email isn't set up, the one-time link is shown so you can send it yourself.

## 7. Timezone: one timezone for everything

1. **Picker.** Settings' free-text field became a dropdown of every timezone, with
   Pacific/Auckland first, then your browser's zone and the current one. Each shows its offset,
   e.g. "Pacific/Auckland (UTC+13)". The offset text appears just after the page loads, because
   server and browser timezone data can differ. The same dropdown is used on `/start`.
2. **"Today" is the wedding's today.** It used to be the UTC date, which was wrong for about
   half of every NZ day. `todayIso(timeZone)` now requires the timezone, and every caller passes
   the wedding's:
   - the Today view and overdue tasks;
   - the calendar and the dashboard;
   - the budget's payment list and payment calendar;
   - quick-add's "tomorrow" / "next Friday";
   - the countdown generator;
   - the weekly digest email, which works out each wedding's own today.
3. **Changing it keeps times as typed** (Q5) via `change_wedding_timezone()` (§4.3). The help
   text says: "Changing this keeps your times as typed (2:00 pm stays 2:00 pm)."

## 8. Currency: a symbol, not a conversion

1. **Picker** in Settings → Wedding basics, and on `/start`:
   - NZD, AUD, USD, GBP, EUR and CAD first, then every other code;
   - names like "New Zealand Dollar" appear just after the page loads, for the same reason as
     the timezone offsets.
2. **It changes the symbol only.** Help text: "This changes the symbol only. Amounts are not
   converted." Stored amounts never change.
3. **Always two decimals**, whatever the currency (Q6): a yen wedding reads "JP¥4,600.00".
4. **Where it shows.** `formatMoney(amount, currency)` now requires the currency, so no screen
   can quietly stay on NZD. It covers:
   - the budget and vendors screens, which read it from a `CurrencyProvider` in the planner
     layout;
   - the dashboard;
   - the activity log;
   - the travel costs on the public site;
   - the registry.

   Budget field labels say "(AUD)" and so on instead of "($NZD)".
5. **Registry "paste a link" autofill** takes a price only when the shop's currency matches the
   wedding's (it used to be NZD only).
6. **GST is unchanged** (Q7): same toggle, 15%, whatever the currency.
7. **Left as is:** the bank-details account-number check is still NZ format.

## 9. Ready for payment later (not built)

A later payment spec would put a Stripe Checkout step after `/start`'s validation and run the
rest of §5.2 from Stripe's confirmation. `create_wedding()` is already the one server-only entry
point, and `ONBOARDING_OPEN` already gates the door. No plans, prices or subscriptions here.

## 10. Questions and answers (2026-11-06)

| Q | Question | Answer |
| --- | --- | --- |
| 1 | Who may sign up? | **Anyone**, behind `ONBOARDING_OPEN`, a throttle and a honeypot. |
| 2 | Email confirmation before first sign-in? | **No. Go straight in.** (The optional welcome email was not built.) |
| 3 | Password rule? | **At least 8 characters**, nothing else. (Recommendation was 10.) |
| 4 | Partner at sign-up? | **Name and email both optional**; invite sent if an email is given. |
| 5 | Timezone change and existing times? | **Keep times as typed.** |
| 6 | Which currencies? | **"It's just a sign, no conversion, so decimals don't matter."** Any currency, always two decimals. |
| 7 | GST when not NZD? | **Leave it as is.** |
| 8 | Where does sign-up live? | **`/start`** on the app's own domain. |
| 9 | Change login email in Settings? | **Leave out.** |

## 11. Not in scope

- Payment, plans, trials (§9).
- Converting amounts, or more than one currency per wedding.
- Changing the login email, or deleting an account or wedding.
- One login on several weddings.
- Social sign-in, magic links, two-factor.
- A welcome email to the person who signed up.
- A marketing site.

## 12. Beyond the bare minimum (candidates to cut)

The core ask is: §5's sign-up, §6's names and change password, §7's timezone, and §8's currency
symbol. These parts were built on top of that and could be removed if you want the smallest
version:

| Part | Why it's there | Cost of cutting |
| --- | --- | --- |
| Partner **Re-send** and **Change email** buttons (§6) | Recover from a lost email or a typo | Without them, a typo'd partner email can only be fixed in the Supabase dashboard |
| Change-password throttle (§6) | Stops guessing the current password | Small; Supabase has its own rate limits |
| Registry autofill following the currency (§8.5) | An AUD wedding would otherwise take NZD prices as AUD | Low; prices can be typed by hand |
| Timezone offsets and currency names in the dropdowns (§7.1, §8.1) | Easier to pick the right one | Plain codes only |
| "Keep times as typed" on timezone change (§4.3) | Q5's answer | Times would shift when the timezone is corrected |

The throttle, honeypot and on/off switch on `/start` are Q1's answer, not extras.

## 13. Files

| Area | Files |
| --- | --- |
| Database | `supabase/migrations/0045_onboarding_timezone_currency.sql`, `supabase/tests/26_onboarding.sql`, `supabase/bootstrap.sql`, `scripts/verify-bootstrap.sh` |
| Sign-up | `src/app/start/page.tsx`, `src/app/start/start-form.tsx`, `src/server/actions/onboarding.ts`, `src/server/partner-invite.ts`, `src/lib/onboarding.ts` (+ test), `src/lib/public-paths.ts`, `src/lib/env.ts`, `src/lib/email/templates.ts` (`partnerInviteEmail`) |
| Settings | `src/components/settings/account-section.tsx`, `src/server/actions/auth.ts`, `src/server/actions/partner.ts`, `src/server/queries/partner.ts`, `src/server/actions/settings.ts`, `src/components/settings/wedding-basics-form.tsx` |
| Timezone | `src/components/timezone-select.tsx`, `src/lib/timezone.ts` (`todayInZone`), `src/lib/lists/generate.ts` (`todayIso`) and its callers |
| Currency | `src/components/currency-select.tsx`, `src/components/currency-context.tsx`, `src/lib/format.ts` (`formatMoney`, `currencySymbol`) and its callers |

## 14. Verification

- **Passed:**
  - `npm run typecheck`;
  - 1263 unit tests (19 new);
  - `verify-migrations.sh`: 770 SQL assertions, the earlier 740 unchanged plus 30 new;
  - `verify-migrations-single-tx.sh` and `verify-bootstrap.sh`;
  - `next build` (placeholder env).
- **Seen:** `/start` in headless Chromium, placeholder env, at 390px and 1100px wide. No console
  errors, no sideways scroll, the wedding name fills itself, Auckland and NZD are pre-selected.
- **Not verified:**
  - anything against Supabase: no real sign-up, partner email, password change or timezone
    change has run;
  - Settings has never rendered, because it needs a signed-in session;
  - the riskiest untested parts are the Supabase admin calls and the exact "email already
    taken" error they return.

**To check it for real:**

1. Run `node scripts/verify-live.mjs`.
2. Apply `0045`.
3. Set `ONBOARDING_OPEN=true` in Vercel.
4. Sign up at `/start` with two real addresses.
5. Confirm:
   - the partner's email arrives and its link sets a password;
   - a second account can't see the first wedding;
   - Settings changes the password and the currency;
   - a timezone change leaves the ceremony time as typed.
