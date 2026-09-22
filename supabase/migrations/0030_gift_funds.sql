-- ===========================================================================
-- 0030_gift_funds.sql — the "a gift, if you are moved" block
--
-- A wedding list, as most couples actually run one now: two or three things
-- worth saving towards — the honeymoon, a new kitchen, a donation — rather
-- than a department-store registry.
--
-- WHAT THIS DELIBERATELY IS NOT: a payment integration. There is no provider
-- chosen, no webhook, no ledger, and this migration does not pretend
-- otherwise. `contribute_url` is a link the couple supplies — their bank's
-- request-money page, a Wise link, a charity's donation page — and
-- `raised_minor` is A FIGURE THEY TYPE, kept up to date from whatever actually
-- receives the money.
--
-- That is stated in the schema rather than left to be discovered because the
-- alternative shape — a `gift_contributions` table nothing writes to and a
-- `raised` column summed from it — would look like a working payment path to
-- the next person reading this file. It would be an empty ledger with a
-- progress bar on top. When a provider is chosen, the contributions table
-- lands then, and `raised_minor` becomes its sum in the same migration.
--
-- The guest site says so too: the block calls the figure "raised so far" and
-- the button is a link out, not a checkout.
--
-- MONEY IS INTEGER MINOR UNITS, NZD (spec 18, and docs/wedding-platform-spec
-- .md's rule for every table). No floats, no rounding, and no currency column
-- — every wedding here is NZD only, exactly as `budget_items` has it.
-- ===========================================================================

create table public.gift_funds (
  id             uuid primary key default gen_random_uuid(),
  wedding_id     uuid not null references public.weddings (id) on delete cascade,
  name           text not null,
  -- The italic line under the name — "two weeks somewhere with no phone
  -- signal". Optional: a fund called "Honeymoon" explains itself.
  blurb          text,
  -- What they are saving towards. Nullable rather than zero, because a fund
  -- with no target is a real thing ("anything towards the honeymoon") and the
  -- renderer draws no progress rule for one. Zero would draw a full bar.
  target_minor   integer,
  -- What has come in, as the couple last recorded it. See the header.
  raised_minor   integer not null default 0,
  -- Where the button sends a guest. Nullable: a fund with no link renders as
  -- a name and a figure, which is still worth saying on the page.
  contribute_url text,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, wedding_id),
  check (name <> ''),
  check (char_length(name) <= 120),
  check (char_length(coalesce(blurb, '')) <= 400),
  -- Negative money is not a state this can reach honestly, and a negative
  -- target would draw the progress rule backwards.
  check (target_minor is null or target_minor > 0),
  check (raised_minor >= 0),
  -- http(s) only. The href goes in front of every guest, and a `javascript:`
  -- or `data:` URL typed into a planner form is the one thing that turns a
  -- text column into an XSS surface.
  check (contribute_url is null or contribute_url ~* '^https?://')
);

create index gift_funds_wedding_idx on public.gift_funds (wedding_id, sort_order, created_at);

create trigger gift_funds_touch before update on public.gift_funds
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- The same shape as every tenant table (see supabase/migrations/README.md).
-- The public page reads through the service role, which bypasses RLS and
-- scopes itself by wedding; `anon` is revoked so a leaked publishable key
-- cannot read one wedding's funds from another's session.
alter table public.gift_funds enable row level security;
alter table public.gift_funds force row level security;

create policy gift_funds_collaborator on public.gift_funds
  for all to authenticated
  using (public.is_collaborator(wedding_id))
  with check (public.is_collaborator(wedding_id));

revoke all on public.gift_funds from anon;
