-- ===========================================================================
-- 0033_gift_bank_details.sql — where a guest sends a gift
--
-- Spec 28 §6.1. The gift block used to show each fund with a target and a
-- "raised so far" figure and a link out. The couple's reading was that a gift
-- is a transfer to their bank account: the page should name what they are
-- saving towards, and a **Contribute** button should open their account
-- details with a Copy beside each value. This is the table behind that popup.
--
-- ONE SET PER WEDDING (Q9), not per fund. Most couples have one account;
-- the funds stay as named things to give towards and every Contribute opens
-- the same details. A table of its own rather than columns on `weddings`:
-- `getCurrentWedding()` reads `weddings.*` into the planner's pages, and an
-- account number has no business riding along in every one of those reads.
--
-- WHAT THIS IS NOT: a payment integration, exactly as 0030 says of
-- `gift_funds`. The account number is text the couple typed, shown to guests
-- so they can type it into their own banking app. Nothing here takes money,
-- confirms receipt, or knows who gave what — the per-household reference
-- ("Okonkwo gift") exists so the couple can tell for themselves.
--
-- `gift_funds.target_minor` and `raised_minor` are NOT dropped. They are the
-- couple's own typing, migrations here are append-only, and dropping a column
-- people have typed into is a data loss. The page simply stops reading them.
--
-- NEW ACCOUNT NUMBERS ARE STORED AS DIGITS ONLY (15 or 16 of them: bank 2,
-- branch 4, account 7, suffix 2 or 3 — NZ's `12-3456-7890123-00`). The
-- grouping is presentation and is added at render time, so a number pasted
-- with spaces, dashes or neither is one number, and "copy" gives a value a
-- banking app will accept in whichever form it asks for.
-- ===========================================================================

create table public.gift_bank_details (
  -- The primary key IS the wedding: one row each, never two.
  wedding_id     uuid primary key references public.weddings (id) on delete cascade,
  account_name   text,
  -- Digits only. See the header.
  account_number text,
  -- The warm line at the top of the popup. Null means the app's own default.
  message        text,
  -- Anything else a guest should know — "Kiwibank, if that helps".
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (account_name is null or (account_name <> '' and char_length(account_name) <= 120)),
  check (account_number is null or account_number ~ '^[0-9]{15,16}$'),
  check (message is null or char_length(message) <= 300),
  check (note is null or char_length(note) <= 400)
);

create trigger gift_bank_details_touch before update on public.gift_bank_details
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- The same shape as every tenant table (see supabase/migrations/README.md).
-- The guest page reads through the service role, which bypasses RLS and scopes
-- itself by wedding; `anon` is revoked so a leaked publishable key cannot read
-- one couple's bank account from another's session — or from nobody's.
alter table public.gift_bank_details enable row level security;
alter table public.gift_bank_details force row level security;

create policy gift_bank_details_collaborator on public.gift_bank_details
  for all to authenticated
  using (public.is_collaborator(wedding_id))
  with check (public.is_collaborator(wedding_id));

revoke all on public.gift_bank_details from anon;
