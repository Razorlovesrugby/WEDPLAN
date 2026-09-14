-- ===========================================================================
-- Derived reads
-- ===========================================================================
-- security_invoker = true means these views run with the caller's privileges,
-- so the RLS policies on the underlying tables still apply. Without it a view
-- is a hole straight through the tenancy model.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- v_households — headcount, seats and derived tier
-- ---------------------------------------------------------------------------
-- `tier` is NOT stored. It is the household's rank compared against the two
-- cut lines on the wedding. Move a cut line, the whole waitlist recalculates
-- with no write and nothing to fall out of sync.
--
-- Seat accounting: adults and children occupy seats, infants do not (laps and
-- high chairs). Caterers count children; venues count seats. Both numbers are
-- exposed so neither has to be guessed at.
create or replace view public.v_households
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
  case
    when w.cut_rank is null                                      then 'A'
    when h.rank <= w.cut_rank                                    then 'A'
    when w.tier_b_rank is null                                   then 'B'
    when h.rank <= w.tier_b_rank                                 then 'B'
    else 'C'
  end::household_tier as tier
from public.households h
join public.weddings w on w.id = h.wedding_id
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
where h.deleted_at is null;

-- ---------------------------------------------------------------------------
-- v_household_rsvp — response state, per household
-- ---------------------------------------------------------------------------
-- response_state is what the chase logic reads:
--   none     nobody in the household has answered anything
--   partial  some answered, some outstanding
--   complete every invited guest has a non-pending answer for every event
--            they were invited to
create or replace view public.v_household_rsvp
with (security_invoker = true) as
select
  h.id            as household_id,
  h.wedding_id,
  i.id            as invitation_id,
  i.sent_at,
  i.opened_at,
  i.channel,
  coalesce(r.total, 0)     as rsvp_total,
  coalesce(r.answered, 0)  as rsvp_answered,
  coalesce(r.yes, 0)       as rsvp_yes,
  coalesce(r.no, 0)        as rsvp_no,
  coalesce(r.maybe, 0)     as rsvp_maybe,
  case
    when coalesce(r.answered, 0) = 0             then 'none'
    when r.answered < r.total                    then 'partial'
    else 'complete'
  end as response_state
from public.households h
left join public.invitations i
  on i.household_id = h.id and i.deleted_at is null
left join lateral (
  select
    count(*)::int                                        as total,
    count(*) filter (where rs.status <> 'pending')::int  as answered,
    count(*) filter (where rs.status = 'yes')::int       as yes,
    count(*) filter (where rs.status = 'no')::int        as no,
    count(*) filter (where rs.status = 'maybe')::int     as maybe
  from public.rsvps rs
  join public.guests g on g.id = rs.guest_id and g.deleted_at is null
  where g.household_id = h.id
) r on true
where h.deleted_at is null;

-- ---------------------------------------------------------------------------
-- v_wedding_stats — the dashboard, in one row
-- ---------------------------------------------------------------------------
-- Every number on the planner home screen comes from here, so the dashboard
-- cannot drift from the lists it links to.
create or replace view public.v_wedding_stats
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
    count(*)::int                                        as household_count,
    count(*) filter (where v.tier = 'A')::int            as above_cut_households,
    coalesce(sum(v.seat_count) filter (where v.tier = 'A'), 0)::int as above_cut_seats
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

revoke all on public.v_households, public.v_household_rsvp, public.v_wedding_stats from anon;
grant select on public.v_households, public.v_household_rsvp, public.v_wedding_stats to authenticated;
