-- ===========================================================================
-- 0031: save-the-date opens, counted apart from invitation opens
-- ===========================================================================
-- The save-the-date now has a page of its own —
-- `/w/<wedding>/<household>/save-the-date` — and the planner wants to see,
-- in Guests, when each household last opened it.
--
-- It reuses `invitation_views` rather than adding a table: the row is the same
-- shape (a household and a time, and nothing about the reader — 0023's rule),
-- and a second table would be a second place for that rule to be forgotten.
-- `source` gains 'save_the_date'.
--
-- **The two kinds of open must not be added together.** A household that
-- looked at the save-the-date in March has not seen the invitation, and
-- `/invitations`' "read, no reply" filter and the household screen's
-- "opened 3 times" would both start saying they had. So `v_household_rsvp`'s
-- existing `last_viewed_at` / `view_count` now exclude save-the-date opens,
-- and two appended columns carry them instead (CREATE OR REPLACE VIEW may
-- only append).
-- ===========================================================================

alter table public.invitation_views
  drop constraint if exists invitation_views_source_check;
alter table public.invitation_views
  add constraint invitation_views_source_check
  check (source in ('address', 'token', 'email', 'save_the_date'));

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
  coalesce(s.std_view_count, 0) as std_view_count
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
where h.deleted_at is null;
