-- ===========================================================================
-- 0012: Budget's guest-population helper follows spec 5's tier rewrite
-- ===========================================================================
-- `0008_multi_cut_lines.sql` (spec 5, part A) replaced v_households.tier's
-- fixed 'A'/'B'/'C' labels with planner-chosen text and added tier_position,
-- where 0 is always the top tier regardless of its label. This function
-- still filtered on the literal `h.tier = 'A'`, which silently stopped
-- matching anything the moment a planner renamed their top line — nobody
-- would be "invited" by this function's count ever again.
--
-- `0010_budget.sql`/`0011_budget_manual_quantity.sql` are this schema's own
-- prior migrations and, per "one feature, one migration"
-- (supabase/migrations/README.md), get a new file rather than an in-place
-- edit even though neither has been applied to a live project yet — 0011
-- already set that precedent for 0010 itself.
-- ===========================================================================

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
    and h.tier_position = 0
    and (
      p_event_id is null
      or exists (
        select 1
        from public.invitations i
        join public.invitation_events ie
          on ie.invitation_id = i.id and ie.wedding_id = i.wedding_id
        where i.household_id = h.id
          and i.wedding_id = p_wedding_id
          and i.deleted_at is null
          and ie.event_id = p_event_id
      )
    );
$$;
