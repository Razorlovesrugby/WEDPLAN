-- ===========================================================================
-- 0030: Drink plans -- what to buy, from the headcount the app already knows
-- ===========================================================================
-- `docs/planning-spreadsheet-gaps.md` section 5, Pattern C. The sheet's drink
-- calculator takes a guessed guest count typed into a yellow box. This app
-- knows the real one, per event, live, so the shopping list moves as RSVPs
-- land. That difference is the whole point of the feature.
--
-- WHAT THIS TABLE DELIBERATELY DOES NOT STORE
--
-- No serving count, no bottle count, no cost. Only the inputs a human
-- chooses: how long the bar runs, how hard the room drinks, whether there is
-- a toast, and how the drinking splits. Everything else is derived -- the
-- headcount by `v_drink_plans` below, the servings and containers by
-- `src/lib/drinks.ts`.
--
-- This matters because `consumption_components` (0010_budget.sql) ALREADY
-- computes headcount x hours x servings-per-guest-per-hour against a live
-- guest basis, and costs it. The gaps document proposed a `drink_plans` table
-- carrying its own `hours` and its own multiplication, which would have been
-- a second copy of a number the budget already holds -- and the second copy
-- is the one that goes stale. So:
--
--   the budget answers "what will the drinks cost"  -> consumption_components
--   the drink plan answers "what do I buy"          -> this table
--
-- They are linked (`budget_item_id`) for navigation and nothing else. The
-- plan never writes to the budget and the budget never writes to the plan.
-- There is no sync step because there is nothing to keep in sync.
--
-- WHY THE CONTAINER MATHS IS NOT IN SQL
--
-- Nothing in the database needs a bottle count -- no view aggregates it, no
-- digest reads it, no RLS policy depends on it. Putting "5 servings per 750ml"
-- in both SQL and TypeScript would be two places to correct when someone buys
-- magnums. It lives in `src/lib/drinks.ts` alone, which is also where it can
-- be unit tested. This is the opposite call to `src/lib/budget.ts`, and
-- deliberately: that file duplicates `v_budget_items` because a client-side
-- preview genuinely needs the server's answer without a round trip.
--
-- 0001-0003 are applied to the live project and frozen. This file only adds.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- drink_headcount_source
-- ---------------------------------------------------------------------------
-- The gaps document names four sources: confirmed, invited, above_cut and
-- manual. In THIS schema `above_cut` is not distinct from `invited`:
-- `budget_guest_population` (0010, rewritten by 0023) is already restricted
-- to tier A households, and tier A is what "above the cut line" means. A
-- fourth value would be a synonym that reads like a choice, so there are
-- three.
create type drink_headcount_source as enum ('confirmed', 'invited', 'manual');

-- ---------------------------------------------------------------------------
-- drink_plans
-- ---------------------------------------------------------------------------
create table public.drink_plans (
  id               uuid primary key default gen_random_uuid(),
  wedding_id       uuid not null,
  -- Null means the whole wedding. Set, and both the headcount and the plan
  -- scope to that event -- a welcome dinner and a reception drink very
  -- differently and are not one shopping list.
  event_id         uuid,
  label            text not null,

  hours            numeric(4, 2) not null check (hours >= 0 and hours <= 24),
  -- 0.85 light, 1.00 average, 1.15 heavy, 1.30 extra heavy (the sheet's own
  -- four settings). Stored as the number rather than an enum so a room that
  -- drinks like 1.42 can be recorded honestly.
  intensity        numeric(4, 2) not null default 1.00
                     check (intensity > 0 and intensity <= 3),
  champagne_toast  boolean not null default false,

  -- The three alcohol shares, and the three-way split within the wine share.
  -- The sheet asks the user to check these sum to 1 by eye and silently
  -- produces nonsense when they do not; here it is a constraint. numeric is
  -- exact decimal, so `= 1` is a safe equality -- this is not floating point.
  beer_share       numeric(5, 4) not null default 0.2500 check (beer_share   >= 0 and beer_share   <= 1),
  wine_share       numeric(5, 4) not null default 0.2500 check (wine_share   >= 0 and wine_share   <= 1),
  spirit_share     numeric(5, 4) not null default 0.5000 check (spirit_share >= 0 and spirit_share <= 1),
  red_share        numeric(5, 4) not null default 0.4000 check (red_share    >= 0 and red_share    <= 1),
  white_share      numeric(5, 4) not null default 0.4000 check (white_share  >= 0 and white_share  <= 1),
  rose_share       numeric(5, 4) not null default 0.2000 check (rose_share   >= 0 and rose_share   <= 1),

  headcount_source drink_headcount_source not null default 'confirmed',
  -- Required when and only when the source is manual. A number left lying
  -- around from a previous source is a number that will be believed later.
  manual_headcount integer check (manual_headcount >= 0),

  -- Navigation only. See this file's header: the plan never writes here.
  budget_item_id   uuid,

  notes            text,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (id, wedding_id),
  foreign key (event_id, wedding_id)
    references public.events (id, wedding_id) on delete set null (event_id),
  foreign key (budget_item_id, wedding_id)
    references public.budget_items (id, wedding_id) on delete set null (budget_item_id),

  check (label <> ''),
  constraint drink_plans_alcohol_shares_sum
    check (beer_share + wine_share + spirit_share = 1),
  constraint drink_plans_wine_shares_sum
    check (red_share + white_share + rose_share = 1),
  constraint drink_plans_manual_headcount_present
    check ((headcount_source = 'manual') = (manual_headcount is not null))
);

create index drink_plans_wedding_idx on public.drink_plans (wedding_id, sort_order);
create index drink_plans_event_idx on public.drink_plans (event_id) where event_id is not null;
create index drink_plans_budget_item_idx
  on public.drink_plans (budget_item_id) where budget_item_id is not null;

create trigger drink_plans_touch before update on public.drink_plans
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- v_drink_plans
-- ---------------------------------------------------------------------------
-- The plan's rows with the headcount resolved live, which is the whole
-- feature. `budget_head_count` on the 'adult' basis is the drinking
-- population: 0010 section 10 decision 2 already settled that children carry
-- a per-child cost basis and infants none, and neither drinks.
--
--   confirmed -> RSVP'd yes (and, before any RSVP exists at all,
--                `budget_guest_population` answers "assume everyone comes",
--                so an empty guest list does not read as a dry wedding)
--   invited   -> everyone above the cut invited to this event
--   manual    -> the typed number, for a plan made before the list exists
-- security_invoker = true so RLS on drink_plans still applies to whoever
-- selects from the view, per 0003's rule for every derived view here.
-- Columns are listed rather than `dp.*` because a view's star is expanded
-- and frozen at creation anyway -- writing them out makes the next
-- `create or replace` a readable diff instead of a guess.
create or replace view public.v_drink_plans
with (security_invoker = true) as
select
  dp.id,
  dp.wedding_id,
  dp.event_id,
  dp.label,
  dp.hours,
  dp.intensity,
  dp.champagne_toast,
  dp.beer_share,
  dp.wine_share,
  dp.spirit_share,
  dp.red_share,
  dp.white_share,
  dp.rose_share,
  dp.headcount_source,
  dp.manual_headcount,
  dp.budget_item_id,
  dp.notes,
  dp.sort_order,
  dp.created_at,
  dp.updated_at,
  ev.name as event_name,
  bi.label as budget_item_label,
  case dp.headcount_source
    when 'manual' then dp.manual_headcount
    when 'invited' then
      public.budget_head_count(dp.wedding_id, dp.event_id, 'adult', true)::int
    else
      public.budget_head_count(dp.wedding_id, dp.event_id, 'adult', false)::int
  end as headcount
from public.drink_plans dp
left join public.events ev on ev.id = dp.event_id and ev.wedding_id = dp.wedding_id
left join public.budget_items bi on bi.id = dp.budget_item_id and bi.wedding_id = dp.wedding_id;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
-- Same shape as every other tenant table (0002's rule): keyed to wedding_id,
-- collaborators only, anon revoked. Drinks are never public -- no guest
-- surface reads this.
alter table public.drink_plans enable row level security;
alter table public.drink_plans force row level security;
create policy drink_plans_collaborator on public.drink_plans
  for all to authenticated
  using (public.is_collaborator(wedding_id))
  with check (public.is_collaborator(wedding_id));
revoke all on public.drink_plans from anon;

revoke all on public.v_drink_plans from anon;
grant select on public.v_drink_plans to authenticated;
