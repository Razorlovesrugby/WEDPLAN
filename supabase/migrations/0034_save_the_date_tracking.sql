-- ===========================================================================
-- 0034: tracking what has been sent, and "I already know I can't come"
--       (spec 29)
-- ===========================================================================
-- Two requests, one migration:
--
--   A. A "Save the Date Sent" tick per household. There was nowhere to put it:
--      `message_log` records emailed save-the-dates only, and the planner sends
--      the link by hand. It lives on `households`, not `invitations`, so a
--      household with no invitation yet can still be ticked — a save-the-date
--      predates one. ("Invite Sent" needs no column: it is the existing
--      `invitations.sent_at`.)
--
--   B. A guest who is certain they cannot come can say so from their
--      save-the-date, so the couple can leave them off the formal invitation.
--      That is a flag on the GUEST (`unable_to_attend_at` / `_via`) and
--      deliberately NOT an `rsvps` row (spec 29 §4.1): an rsvp row would count
--      as an answer in `v_household_rsvp`, would usually have no invited event
--      to hang on, and would show up pre-filled on the invitation page later.
--
-- The flag is cleared by setting both columns to null. It is a note on a guest,
-- not guest data being destroyed — `deleted_at` stays the only way a guest ever
-- leaves the list (docs/wedding-platform-spec.md).
--
-- ---------------------------------------------------------------------------
-- HEADCOUNT (spec 29 §4.6, Q3)
-- ---------------------------------------------------------------------------
-- The planner chose to have flagged guests stop counting in catering and seat
-- numbers. The guest stays INVITED — `v_guest_event_invites.invited` is not
-- touched, so the grid and the record of who was asked are unchanged. What
-- changes is who is COUNTED, and the rule is written once, in
-- `guest_excluded_from_counts()`, because spec 22 learned what happens when
-- invited-ness is worked out in several places: the caterer's number quietly
-- disagrees with the guest list.
--
--   excluded = flagged AND has not since answered Yes to anything.
--
-- A Yes outranks the flag (spec 29 §4.3.5): the flag says "told us in advance",
-- the RSVP is the answer, and a number must never contradict an answer.
--
-- Consumers changed here: budget_guest_population (so /budget's per-head costs
-- and /guests/rank's per-seat figure), v_households.seat_count (so the
-- dashboard's seats-vs-capacity and the rank screen), and v_wedding_stats'
-- outstanding_guests (a guest who has said they cannot come is not someone we
-- are still waiting to hear from). `rsvp_*` counts and `response_state` are
-- NOT touched: those are RSVP answers, and this is not one.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.households
  add column save_the_date_sent_at timestamptz;

alter table public.guests
  add column unable_to_attend_at  timestamptz,
  add column unable_to_attend_via text;

-- Both set or both null. A range check on each column alone passes when the
-- other is NULL — 0032 shipped that bug for a focal point and the SQL test
-- caught it — so the pairing is its own constraint.
alter table public.guests
  add constraint guests_unable_via_check
    check (unable_to_attend_via in ('save_the_date', 'planner')),
  add constraint guests_unable_pair
    check ((unable_to_attend_at is null) = (unable_to_attend_via is null));

comment on column public.guests.unable_to_attend_at is
  'When this guest told us (or the planner recorded) that they cannot come. NOT an RSVP (spec 29 §4.1).';
comment on column public.households.save_the_date_sent_at is
  'When the planner ticked "Save the Date Sent" (or the emailed send stamped it). Household-level: works with no invitation.';

-- ---------------------------------------------------------------------------
-- The one place the counting rule is written
-- ---------------------------------------------------------------------------
create or replace function public.guest_excluded_from_counts(p_guest_id uuid)
returns boolean
language sql
stable
as $$
  select
    exists (
      select 1 from public.guests g
      where g.id = p_guest_id and g.unable_to_attend_at is not null
    )
    and not exists (
      select 1 from public.rsvps r
      where r.guest_id = p_guest_id and r.status = 'yes'
    );
$$;

revoke execute on function public.guest_excluded_from_counts(uuid) from public, anon;
grant execute on function public.guest_excluded_from_counts(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- v_guest_event_invites — one appended column
-- ---------------------------------------------------------------------------
-- `invited` and everything before it are exactly 0023's. The new column is the
-- counting rule above, so a consumer that already reads this view can filter on
-- it without re-deriving anything. CREATE OR REPLACE VIEW may only append.
create or replace view public.v_guest_event_invites
with (security_invoker = true) as
select
  g.wedding_id,
  g.household_id,
  g.id                                   as guest_id,
  e.id                                   as event_id,
  coalesce(o.invited, he.invited, false) as invited,
  coalesce(he.invited, false)            as household_invited,
  o.invited                              as override,
  i.id                                   as invitation_id,
  i.sent_at,
  public.guest_excluded_from_counts(g.id) as excluded_from_counts
from public.guests g
join public.events e
  on e.wedding_id = g.wedding_id
left join lateral (
  select inv.id, inv.sent_at
  from public.invitations inv
  where inv.household_id = g.household_id
    and inv.deleted_at is null
  limit 1
) i on true
left join lateral (
  select true as invited
  from public.invitation_events iev
  where iev.invitation_id = i.id
    and iev.event_id = e.id
  limit 1
) he on true
left join public.guest_event_overrides o
  on o.guest_id = g.id
 and o.event_id = e.id
where g.deleted_at is null;

-- ---------------------------------------------------------------------------
-- v_household_rsvp — what /invitations needs, appended
-- ---------------------------------------------------------------------------
-- Everything up to std_view_count is 0031's, unchanged (including that
-- save-the-date opens stay out of last_viewed_at / view_count). Appended:
--   std_sent_at   the "Save the Date Sent" tick
--   guest_total   active guests in the household
--   unable_count  those with the flag set (the raw flag, not the counting rule:
--                 this is what the chip says, and what "everyone has declined"
--                 means to the bulk-send guards)
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
  end as response_state,
  v.last_viewed_at,
  coalesce(v.view_count, 0) as view_count,
  s.std_last_viewed_at,
  coalesce(s.std_view_count, 0) as std_view_count,
  h.save_the_date_sent_at as std_sent_at,
  gc.guest_total,
  gc.unable_count
from public.households h
left join public.invitations i
  on i.household_id = h.id and i.deleted_at is null
left join lateral (
  select
    count(*)::int                                            as total,
    count(*) filter (where rs.status is not null
                       and rs.status <> 'pending')::int      as answered,
    count(*) filter (where rs.status = 'yes')::int           as yes,
    count(*) filter (where rs.status = 'no')::int            as no,
    count(*) filter (where rs.status = 'maybe')::int         as maybe
  from public.v_guest_event_invites vi
  left join public.rsvps rs
    on rs.guest_id = vi.guest_id and rs.event_id = vi.event_id
  where vi.household_id = h.id
    and vi.invited
) r on true
left join lateral (
  select max(iv.viewed_at) as last_viewed_at, count(*)::int as view_count
  from public.invitation_views iv
  where iv.household_id = h.id
    and iv.source <> 'save_the_date'
) v on true
left join lateral (
  select max(iv.viewed_at) as std_last_viewed_at, count(*)::int as std_view_count
  from public.invitation_views iv
  where iv.household_id = h.id
    and iv.source = 'save_the_date'
) s on true
cross join lateral (
  select
    count(*)::int                                          as guest_total,
    count(*) filter (where g.unable_to_attend_at is not null)::int as unable_count
  from public.guests g
  where g.household_id = h.id
    and g.deleted_at is null
) gc
where h.deleted_at is null;

-- ---------------------------------------------------------------------------
-- v_households — seat_count stops counting a guest who cannot come
-- ---------------------------------------------------------------------------
-- Only `seat_count` changes (and with it seats_cumulative and the dashboard's
-- above-the-line seats). head_count / adult_count / child_count / infant_count
-- stay the household's COMPOSITION — who is on the list — which is not an
-- attendance figure. Otherwise 0022's definition, column for column.
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
  t.label as tier,
  t.position as tier_position,
  h.slug,
  h.slug_suffix
from public.households h
cross join lateral (
  select
    count(*)::int                                                      as head_count,
    count(*) filter (where g.age_band = 'adult')::int                  as adult_count,
    count(*) filter (where g.age_band = 'child')::int                  as child_count,
    count(*) filter (where g.age_band = 'infant')::int                 as infant_count,
    count(*) filter (
      where g.age_band in ('adult', 'child')
        and not public.guest_excluded_from_counts(g.id)
    )::int                                                             as seat_count
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
-- v_wedding_stats — outstanding_guests is "still waiting to hear from"
-- ---------------------------------------------------------------------------
-- 0023's definition, column for column. The one change is in `rr`: a guest who
-- has told us they cannot come is not someone we are waiting on, so they leave
-- `outstanding_guests`. They are deliberately NOT added to `declined_guests`:
-- that is the RSVP "No" count and this is not an RSVP. A guest who has answered
-- anything is counted exactly as before.
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
  end as seats_remaining,
  ss.silent_households
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
  select count(*)::int as silent_households
  from public.v_household_rsvp hr
  where hr.wedding_id = w.id
    and hr.sent_at is not null
    and (hr.opened_at is not null or hr.view_count > 0)
    and hr.response_state = 'none'
) ss
cross join lateral (
  select
    count(distinct vi.guest_id) filter (where rs.status = 'yes')::int    as attending_guests,
    count(distinct vi.guest_id) filter (where rs.status = 'no')::int     as declined_guests,
    count(distinct vi.guest_id) filter (where rs.status = 'maybe')::int  as maybe_guests,
    count(distinct vi.guest_id) filter (
      where (rs.status is null or rs.status = 'pending')
        and not vi.excluded_from_counts
    )::int                                                               as outstanding_guests
  from public.v_guest_event_invites vi
  left join public.rsvps rs
    on rs.guest_id = vi.guest_id and rs.event_id = vi.event_id
  where vi.wedding_id = w.id and vi.invited
) rr;

-- ---------------------------------------------------------------------------
-- budget_guest_population — the per-head costing
-- ---------------------------------------------------------------------------
-- 0023's definition with one added condition. This is where the headcount
-- change bites hardest, because the function says "no RSVPs yet means assume
-- everyone comes" — which is exactly the stage a save-the-date decline happens
-- at. Once RSVPs exist the yes-only rule already excludes a flagged guest, but
-- the guard is applied in every branch so the population itself is honest.
create or replace function public.budget_guest_population(
  p_wedding_id uuid, p_event_id uuid, p_force_invited boolean default false
)
returns table (guest_id uuid, age_band public.age_band, attending boolean)
language sql
stable
as $$
  select
    g.id,
    g.age_band,
    case
      when p_force_invited then true
      when not public.budget_wedding_has_rsvps(p_wedding_id) then true
      when p_event_id is not null then exists (
        select 1 from public.rsvps rs
        where rs.guest_id = g.id and rs.event_id = p_event_id and rs.status = 'yes'
      )
      else exists (
        select 1 from public.rsvps rs where rs.guest_id = g.id and rs.status = 'yes'
      )
    end as attending
  from public.guests g
  join public.v_households h on h.id = g.household_id and h.wedding_id = g.wedding_id
  where g.wedding_id = p_wedding_id
    and g.deleted_at is null
    and h.tier = 'A'
    and not public.guest_excluded_from_counts(g.id)
    and (
      p_event_id is null
      or exists (
        select 1
        from public.v_guest_event_invites vi
        where vi.guest_id = g.id
          and vi.event_id = p_event_id
          and vi.invited
      )
    );
$$;
