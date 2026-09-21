-- ===========================================================================
-- 0023: inviting per event, per person, and knowing they looked (spec 22)
-- ===========================================================================
-- Three things, all from one request:
--
--   1. Who is invited to what becomes a PERSON-level fact, without throwing
--      away the household-level one. `invitation_events` still says what the
--      household is invited to; `guest_event_overrides` records the
--      exceptions; `v_guest_event_invites` is the single answer everything
--      else reads.
--
--   2. Every open of an invitation is logged, not just the first
--      (`invitation_views`), because "never looked" and "looked five times and
--      still hasn't replied" are two different chasing decisions and today
--      they are the same row.
--
--   3. A declined invitation can carry a message. That is NOT a new column —
--      it is a built-in household-scope question (`rsvp_questions.builtin_key`)
--      so the note lands in `rsvp_answers` beside every other answer, on the
--      screens that already render them.
--
-- WHY AN EXCEPTIONS TABLE rather than materialising a row per guest per
-- event: changing the household's invitation has to keep working on everybody
-- who has not been singled out. With materialised rows, "add the Okonkwos to
-- the brunch" is a fan-out write that silently re-invites the child somebody
-- deliberately removed last week. With exceptions, the deliberate act
-- survives the bulk one.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- guest_event_overrides
-- ---------------------------------------------------------------------------
-- Only exceptions live here. `invited = false` takes one person out of an
-- event their household is invited to; `invited = true` adds one person to an
-- event it is not. No row means "whatever the household says", which is the
-- common case and costs nothing to store.
create table public.guest_event_overrides (
  wedding_id  uuid not null,
  guest_id    uuid not null,
  event_id    uuid not null,
  invited     boolean not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (guest_id, event_id),
  foreign key (guest_id, wedding_id)
    references public.guests (id, wedding_id) on delete cascade,
  foreign key (event_id, wedding_id)
    references public.events (id, wedding_id) on delete cascade
);
create index guest_event_overrides_wedding_idx
  on public.guest_event_overrides (wedding_id, event_id);
create trigger guest_event_overrides_touch before update on public.guest_event_overrides
  for each row execute function public.touch_updated_at();

comment on table public.guest_event_overrides is
  'Per-guest exceptions to their household''s invitation. Read through v_guest_event_invites, never directly (spec 22 §4).';

-- ---------------------------------------------------------------------------
-- invitation_views
-- ---------------------------------------------------------------------------
-- One row per open. Deliberately holds no IP address, no user agent and no
-- fingerprint: the question being answered is "has this household looked at
-- their invitation", and everything past that is data about named guests that
-- nobody could defend holding on the day it leaked.
--
-- The 30-minute collapse (a refresh is not a second open) and the exclusion of
-- the planner's own "preview as them" both live in the application: they are
-- policy about what counts, not about what can be stored.
create table public.invitation_views (
  id            uuid primary key default gen_random_uuid(),
  wedding_id    uuid not null references public.weddings (id) on delete cascade,
  household_id  uuid not null,
  viewed_at     timestamptz not null default now(),
  source        text not null default 'address',
  foreign key (household_id, wedding_id)
    references public.households (id, wedding_id) on delete cascade,
  check (source in ('address', 'token', 'email'))
);
create index invitation_views_household_idx
  on public.invitation_views (wedding_id, household_id, viewed_at desc);

comment on table public.invitation_views is
  'One row per open of a household''s invitation. No IP, no user agent (spec 22 §9).';

-- ---------------------------------------------------------------------------
-- rsvp_questions.builtin_key — the decline note's home
-- ---------------------------------------------------------------------------
-- A question the app owns rather than the planner. It is `active = false`, so
-- the RSVP form (which loads active questions only) never renders it, and the
-- answer still arrives in rsvp_answers where /questions and the household
-- screen already read it.
alter table public.rsvp_questions add column if not exists builtin_key text;

create unique index if not exists rsvp_questions_builtin_key
  on public.rsvp_questions (wedding_id, builtin_key)
  where builtin_key is not null;

comment on column public.rsvp_questions.builtin_key is
  'Set on questions the app owns (decline_note). Null for anything the planner wrote (spec 22 §3a).';

-- One function, used by the backfill below and by the trigger after it, so
-- there is one definition of what the question says rather than two that
-- drift.
create or replace function public.ensure_builtin_questions(p_wedding_id uuid)
returns void
language sql
as $$
  insert into public.rsvp_questions
    (wedding_id, label, help_text, type, scope, active, sort_order, builtin_key)
  values (
    p_wedding_id,
    'Anything you''d like to say?',
    'Offered after someone declines. Optional.',
    'long_text',
    'household',
    false,
    999,
    'decline_note'
  )
  on conflict (wedding_id, builtin_key) where builtin_key is not null do nothing;
$$;

-- Every wedding that exists today.
select public.ensure_builtin_questions(w.id) from public.weddings w;

-- And every wedding created from here. A trigger rather than a lazy upsert in
-- the application: the decline path runs as the service role on an
-- unauthenticated request, and "create a question row if one is missing" is
-- not something that code should be able to do at all.
create or replace function public.weddings_builtin_questions()
returns trigger
language plpgsql
as $$
begin
  perform public.ensure_builtin_questions(new.id);
  return new;
end;
$$;

drop trigger if exists weddings_builtin_questions on public.weddings;
create trigger weddings_builtin_questions
  after insert on public.weddings
  for each row execute function public.weddings_builtin_questions();

-- ---------------------------------------------------------------------------
-- v_guest_event_invites — the one answer to "is this person invited?"
-- ---------------------------------------------------------------------------
-- Every guest crossed with every event, carrying the effective answer and
-- enough context for the grid to explain itself. At a wedding's scale (a few
-- hundred guests, a handful of events) the cross join is nothing, and having
-- the false rows present is what lets the grid tell "not invited" apart from
-- "no such event".
--
-- `household_invited` and `override` are exposed alongside the effective
-- answer so a screen can say WHY a cell reads the way it does without
-- recomputing the coalesce — which is the rule this whole spec turns on:
-- nothing outside this view does that arithmetic again.
create view public.v_guest_event_invites
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
  i.sent_at
from public.guests g
join public.events e
  on e.wedding_id = g.wedding_id
-- The household's live invitation, WHATEVER it covers. Deliberately not
-- joined through invitation_events: a household that holds an invitation but
-- is not invited to this event still has one, and a screen that reported
-- otherwise would refuse to let the planner invite them — which is exactly
-- the cell they are clicking on.
left join lateral (
  select inv.id, inv.sent_at
  from public.invitations inv
  where inv.household_id = g.household_id
    and inv.deleted_at is null
  limit 1
) i on true
-- Whether that invitation covers this event.
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

comment on view public.v_guest_event_invites is
  'Effective per-guest, per-event invitation: coalesce(override, household). The only place that coalesce is written (spec 22 §4).';

-- ---------------------------------------------------------------------------
-- v_household_rsvp — counted from invitations, not from rsvp rows
-- ---------------------------------------------------------------------------
-- The change that matters: `rsvp_total` was "how many rsvp rows exist for
-- this household's guests", which stops being the same thing as "how many
-- answers we are waiting for" the moment a guest is un-invited from an event
-- they already answered. Spec 22 §7 keeps that answer rather than deleting
-- it, so the count has to come from who is invited now.
--
-- Two columns appended at the end (CREATE OR REPLACE VIEW may only append):
-- last_viewed_at and view_count, so every screen that already reads this view
-- can show "opened 4 times, last 2 days ago" without a second query.
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
  coalesce(v.view_count, 0) as view_count
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
) v on true
where h.deleted_at is null;

-- ---------------------------------------------------------------------------
-- v_wedding_stats — the same correction, one level up
-- ---------------------------------------------------------------------------
-- attending / declined / maybe / outstanding counted over people who are
-- actually invited to something, so an answer kept from before an un-invite
-- (spec 22 §7) stops inflating the dashboard. Columns unchanged.
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
  -- Appended, not slotted in beside the other invitation counts: CREATE OR
  -- REPLACE VIEW may only add columns at the end, and renaming one to make
  -- room is how a view refuses to replace at 2am.
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
-- Sent, opened, and still nothing back. Its own number because the dashboard
-- used to conflate it with "never opened", and the two need different
-- messages (spec 22 §9).
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
      where rs.status is null or rs.status = 'pending'
    )::int                                                               as outstanding_guests
  from public.v_guest_event_invites vi
  left join public.rsvps rs
    on rs.guest_id = vi.guest_id and rs.event_id = vi.event_id
  where vi.wedding_id = w.id and vi.invited
) rr;

-- ---------------------------------------------------------------------------
-- budget_guest_population — the second place that computed invited-ness
-- ---------------------------------------------------------------------------
-- Spec 6's per-head costing asked "is this household invited to this event"
-- by joining `invitations` and `invitation_events` itself. That was correct
-- when invited-ness was a household fact; with per-guest overrides it counts
-- a child who was deliberately taken off the evening do, and the caterer's
-- number quietly disagrees with the guest list screen.
--
-- Rewritten onto the view, per guest. This is the rule spec 22 §4 turns on:
-- nothing outside `v_guest_event_invites` does this arithmetic.
--
-- Everything else about the function is unchanged — same signature, same
-- tier-A restriction, same "no RSVPs yet means assume everyone comes".
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

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
-- Same shape as every other tenant table (0002's rule): keyed to wedding_id,
-- collaborators only, anon revoked. The public RSVP path reaches these through
-- the service role, which bypasses RLS and scopes itself by token or address.
do $$
declare
  t text;
begin
  foreach t in array array['guest_event_overrides', 'invitation_views'] loop
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

revoke all on public.v_guest_event_invites from anon;
grant select on public.v_guest_event_invites to authenticated;
