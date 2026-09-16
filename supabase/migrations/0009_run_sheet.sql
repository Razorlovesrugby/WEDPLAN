-- ===========================================================================
-- 0009: Day-of run sheet
-- ===========================================================================
-- See docs/specs/05-multi-cut-lines-and-run-sheet.md, Part B. A scoped pull
-- of V3's "run of show" (docs/wedding-platform-spec.md) — a pinned/
-- predecessor time-of-day schedule, one per `events` row. No seating, no
-- printed pack, no vendor table; `owner` is free text for the same
-- "no premature abstraction" reason spec 4 already gives.
--
-- `0001`-`0008` are applied to the live project and frozen. This file only
-- adds.
-- ===========================================================================

create type public.run_sheet_track as enum ('guests', 'couple', 'vendors', 'other');

create table public.run_sheet_items (
  id                uuid primary key default gen_random_uuid(),
  wedding_id        uuid not null references public.weddings (id) on delete cascade,
  event_id          uuid not null,
  title             text not null,
  notes             text,
  location          text,
  -- Free text ("best man", "DJ", "venue coordinator") -- no vendor FK exists
  -- until budget/vendors ships (spec 6 section 2 doesn't add one either).
  owner             text,
  track             public.run_sheet_track not null default 'other',
  pinned            boolean not null default false,
  -- Set iff pinned -- a real wall-clock time for an anchor that never moves
  -- on its own.
  pinned_at         timestamptz,
  duration_minutes  int not null default 0,
  -- Null for a pinned item (it is its own anchor) and *may also* be null for
  -- an unpinned one -- an item with no predecessor yet is allowed to save,
  -- rendered as "time TBD" (B6, decision 5) rather than rejected.
  predecessor_id    uuid,
  offset_minutes    int not null default 0,
  -- Schema-only in this pass (B6, decision 3) -- nothing reads it yet.
  guest_visible     boolean not null default false,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (event_id, wedding_id)
    references public.events (id, wedding_id) on delete cascade,
  -- No ON DELETE action: deleting an item another item's predecessor_id
  -- points at is refused (or re-linked first) at the action layer
  -- (src/server/actions/run-sheet.ts's deleteRunSheetItem) -- same
  -- "don't silently orphan a chain" rule spec 1's parent/sub-item handling
  -- follows. The default NO ACTION is the backstop if that check is ever
  -- bypassed.
  foreign key (predecessor_id, wedding_id)
    references public.run_sheet_items (id, wedding_id),
  check (title <> ''),
  check (duration_minutes >= 0),
  check (predecessor_id is distinct from id),
  -- pinned_at is set exactly when pinned is true.
  check ((pinned and pinned_at is not null) or (not pinned and pinned_at is null)),
  -- A pinned item is its own anchor -- it does not chain off anything.
  check (not pinned or predecessor_id is null)
);
create index run_sheet_items_event_idx on public.run_sheet_items (wedding_id, event_id);
create index run_sheet_items_predecessor_idx
  on public.run_sheet_items (predecessor_id) where predecessor_id is not null;
create trigger run_sheet_items_touch before update on public.run_sheet_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- v_run_sheet_items -- starts_at/ends_at computed via a recursive CTE,
-- exactly the "derived, not stored" rule v_households.tier and
-- seats_cumulative already follow. Mirrored in src/lib/run-sheet.ts for a
-- client-side live preview while editing (same "duplicate deliberately,
-- test against the SQL suite" pattern src/lib/tier.ts and src/lib/budget.ts
-- establish) -- if the two ever disagree, one of those test suites fails.
-- ---------------------------------------------------------------------------
create view public.v_run_sheet_items
with (security_invoker = true) as
with recursive resolved as (
  -- Base case: every pinned item (its own anchor), and every unpinned item
  -- with no predecessor yet ("time TBD").
  select
    r.id, r.wedding_id, r.event_id, r.title, r.notes, r.location, r.owner, r.track,
    r.pinned, r.pinned_at, r.duration_minutes, r.predecessor_id, r.offset_minutes,
    r.guest_visible, r.sort_order, r.created_at, r.updated_at,
    case when r.pinned then r.pinned_at end as starts_at,
    case when r.pinned then r.pinned_at + make_interval(mins => r.duration_minutes) end as ends_at
  from public.run_sheet_items r
  where r.pinned or r.predecessor_id is null

  union all

  -- Recursive case: an unpinned item chains off its predecessor's computed
  -- ends_at, plus its own offset. If the predecessor is itself unresolved
  -- (TBD), null propagates forward, which is correct -- a chain hanging off
  -- an undated item has no time to show either.
  select
    r.id, r.wedding_id, r.event_id, r.title, r.notes, r.location, r.owner, r.track,
    r.pinned, r.pinned_at, r.duration_minutes, r.predecessor_id, r.offset_minutes,
    r.guest_visible, r.sort_order, r.created_at, r.updated_at,
    p.ends_at + make_interval(mins => r.offset_minutes) as starts_at,
    p.ends_at + make_interval(mins => r.offset_minutes) + make_interval(mins => r.duration_minutes) as ends_at
  from public.run_sheet_items r
  join resolved p on p.id = r.predecessor_id and p.wedding_id = r.wedding_id
  where not r.pinned
)
select
  resolved.id,
  resolved.wedding_id,
  resolved.event_id,
  resolved.title,
  resolved.notes,
  resolved.location,
  resolved.owner,
  resolved.track,
  resolved.pinned,
  resolved.pinned_at,
  resolved.duration_minutes,
  resolved.predecessor_id,
  resolved.offset_minutes,
  resolved.guest_visible,
  resolved.sort_order,
  resolved.created_at,
  resolved.updated_at,
  resolved.starts_at,
  resolved.ends_at,
  -- True when this item's computed end runs past the next pinned anchor
  -- (by time, same event) that comes after it -- "warn, never hard-block",
  -- same rule V3 specifies for seating constraints (B2).
  coalesce(nextpin.pinned_at < resolved.ends_at, false) as conflict
from resolved
left join lateral (
  select min(p.pinned_at) as pinned_at
  from resolved p
  where p.wedding_id = resolved.wedding_id
    and p.event_id = resolved.event_id
    and p.pinned
    and p.id <> resolved.id
    and p.pinned_at > resolved.starts_at
) nextpin on true;

revoke all on public.v_run_sheet_items from anon;
grant select on public.v_run_sheet_items to authenticated;

-- ---------------------------------------------------------------------------
-- RLS -- run_sheet_items joins the tenant set.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tenant_tables constant text[] := array['run_sheet_items'];
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
