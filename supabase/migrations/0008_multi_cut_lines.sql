-- ===========================================================================
-- 0008: Multi-cut guest lines
-- ===========================================================================
-- See docs/specs/05-multi-cut-lines-and-run-sheet.md, Part A. Generalises the
-- two fixed cut lines (weddings.cut_rank / tier_b_rank, three hard-coded
-- tiers A/B/C) into a table, so "how many lines" becomes data instead of
-- schema. A6 decisions this migration encodes: a wedding always has at least
-- one row (decision 3's "removing the last line" refusal lives at the action
-- layer, not here); adjacent lines may share a boundary_rank (no schema
-- constraint — a zero-width tier just sits empty); the colour palette (8,
-- fixed, indexed by position) is a client-side constant, not stored.
--
-- `0001`-`0007` are applied to the live project and frozen. This file only
-- adds and rewrites views — no live data exists for this feature yet, but it
-- still gets its own migration per "one feature, one migration."
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- cut_lines
-- ---------------------------------------------------------------------------
create table public.cut_lines (
  id             uuid primary key default gen_random_uuid(),
  wedding_id     uuid not null references public.weddings (id) on delete cascade,
  label          text not null,
  -- 0-indexed, top to bottom. Position 0 is the tier that counts toward
  -- capacity — see v_households.tier_position below.
  position       smallint not null,
  -- Rank of the LAST household in this tier, COLLATE "C" to match
  -- households.rank (docs/HANDOFF.md section 5, point 2) — the same
  -- byte-order comparison the ranking screen makes in JavaScript. Null on
  -- the last line by position: "no lower bound, catches everyone the lines
  -- above didn't." Generalises today's "tier_b_rank null means one
  -- undivided waitlist" rule uniformly to every position.
  boundary_rank  text collate "C",
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, wedding_id),
  unique (wedding_id, position),
  check (label <> '')
);
create index cut_lines_wedding_idx on public.cut_lines (wedding_id, position);
create trigger cut_lines_touch before update on public.cut_lines
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Backfill: one cut_lines row per existing wedding per current line, so
-- every wedding ends up with the exact effective A/B/C split it has today —
-- spec 5, A3, migration step 2.
-- ---------------------------------------------------------------------------
do $$
declare
  w record;
  next_pos smallint;
begin
  for w in select id, cut_rank, tier_b_rank from public.weddings loop
    next_pos := 0;
    insert into public.cut_lines (wedding_id, label, position, boundary_rank)
    values (w.id, 'A', next_pos, w.cut_rank);
    next_pos := next_pos + 1;

    if w.cut_rank is not null or w.tier_b_rank is not null then
      insert into public.cut_lines (wedding_id, label, position, boundary_rank)
      values (w.id, 'B', next_pos, w.tier_b_rank);
      next_pos := next_pos + 1;
    end if;

    insert into public.cut_lines (wedding_id, label, position, boundary_rank)
    values (w.id, 'C', next_pos, null);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- v_households — tier is now the label of the first cut_lines row (ordered by
-- position) whose boundary the household's rank falls within, plus its
-- position. Still fully derived, still not stored.
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE VIEW cannot change an existing column's type (tier goes
-- from the household_tier enum to plain text), so this one has to be
-- dropped and recreated rather than replaced in place. Cascades to
-- v_wedding_stats, which is recreated immediately after; both lose their
-- grants on drop, reapplied at the end of this migration.
drop view public.v_households cascade;

create view public.v_households
with (security_invoker = true) as
select
  h.id,
  h.wedding_id,
  h.display_name,
  h.address,
  h.rank,
  h.reminders_muted,
  h.notes,
  h.created_at,
  h.updated_at,
  c.head_count,
  c.adult_count,
  c.child_count,
  c.infant_count,
  c.seat_count,
  sum(c.seat_count) over (
    partition by h.wedding_id
    order by h.rank
    rows between unbounded preceding and current row
  ) as seats_cumulative,
  t.label as tier,
  t.position as tier_position
from public.households h
cross join lateral (
  select
    count(*)::int                                                      as head_count,
    count(*) filter (where g.age_band = 'adult')::int                  as adult_count,
    count(*) filter (where g.age_band = 'child')::int                  as child_count,
    count(*) filter (where g.age_band = 'infant')::int                 as infant_count,
    count(*) filter (where g.age_band in ('adult', 'child'))::int      as seat_count
  from public.guests g
  where g.household_id = h.id
    and g.deleted_at is null
) c
cross join lateral (
  select cl.label, cl.position
  from public.cut_lines cl
  where cl.wedding_id = h.wedding_id
    and (cl.boundary_rank is null or h.rank <= cl.boundary_rank)
  order by cl.position
  limit 1
) t
where h.deleted_at is null;

-- ---------------------------------------------------------------------------
-- v_wedding_stats — "above cut" now means tier_position = 0 (the top tier,
-- whatever it's named) instead of the literal label 'A'.
-- ---------------------------------------------------------------------------
create view public.v_wedding_stats
with (security_invoker = true) as
select
  w.id as wedding_id,
  w.capacity,
  hh.household_count,
  hh.above_cut_households,
  hh.above_cut_seats,
  gg.guest_count,
  gg.adult_count,
  gg.child_count,
  gg.infant_count,
  ii.invited_households,
  ii.opened_households,
  rr.attending_guests,
  rr.declined_guests,
  rr.maybe_guests,
  rr.outstanding_guests,
  case
    when w.capacity is null then null
    else w.capacity - rr.attending_guests
  end as seats_remaining
from public.weddings w
cross join lateral (
  select
    count(*)::int                                                 as household_count,
    count(*) filter (where v.tier_position = 0)::int               as above_cut_households,
    coalesce(sum(v.seat_count) filter (where v.tier_position = 0), 0)::int as above_cut_seats
  from public.v_households v
  where v.wedding_id = w.id
) hh
cross join lateral (
  select
    count(*)::int                                            as guest_count,
    count(*) filter (where g.age_band = 'adult')::int        as adult_count,
    count(*) filter (where g.age_band = 'child')::int        as child_count,
    count(*) filter (where g.age_band = 'infant')::int       as infant_count
  from public.guests g
  where g.wedding_id = w.id and g.deleted_at is null
) gg
cross join lateral (
  select
    count(*) filter (where i.sent_at is not null)::int    as invited_households,
    count(*) filter (where i.opened_at is not null)::int  as opened_households
  from public.invitations i
  where i.wedding_id = w.id and i.deleted_at is null
) ii
cross join lateral (
  select
    count(distinct rs.guest_id) filter (where rs.status = 'yes')::int      as attending_guests,
    count(distinct rs.guest_id) filter (where rs.status = 'no')::int       as declined_guests,
    count(distinct rs.guest_id) filter (where rs.status = 'maybe')::int    as maybe_guests,
    count(distinct rs.guest_id) filter (where rs.status = 'pending')::int  as outstanding_guests
  from public.rsvps rs
  where rs.wedding_id = w.id
) rr;

-- ---------------------------------------------------------------------------
-- Drop the fixed two-line columns and the three-value enum they backed.
-- ---------------------------------------------------------------------------
alter table public.weddings drop column cut_rank;
alter table public.weddings drop column tier_b_rank;
drop type public.household_tier;

-- Both views were dropped and recreated above, which drops their grants
-- along with the object — reapply 0003's grants.
revoke all on public.v_households, public.v_wedding_stats from anon;
grant select on public.v_households, public.v_wedding_stats to authenticated;

-- ---------------------------------------------------------------------------
-- RLS — cut_lines joins the tenant set.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tenant_tables constant text[] := array['cut_lines'];
begin
  foreach t in array tenant_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy %1$I on public.%2$I for all to authenticated '
      'using (public.is_collaborator(wedding_id)) '
      'with check (public.is_collaborator(wedding_id))',
      t || '_collaborator', t
    );
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;
