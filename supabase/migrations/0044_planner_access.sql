-- 0044_planner_access.sql  (spec 39, part C)
--
-- A planner who can sign in, and who sees everything about the wedding except
-- the money and what is private to the couple.
--
-- THE DESIGN RULE: the planner is NOT a row in `collaborators`. Every existing
-- policy is `is_collaborator(wedding_id)` and none of them is touched here, so
-- the couple's access is byte-for-byte what it was. The planner is a `people`
-- row with a login (`user_id`) and `access = 'planner'` (0043), recognised by
-- `can_plan()`. They get ADDITIVE policies on the tables listed in
-- `planner_table_access` below and on nothing else. A table nobody lists is
-- invisible to the planner, not open to them -- and the SQL test fails until
-- someone lists it, so a future table cannot be forgotten.
--
-- Views in this schema are all `security_invoker`, so they obey the viewer's
-- access: a planner reading `v_budget_items` gets no rows.

-- ---------------------------------------------------------------------------
-- can_plan(): is the signed-in user an active planner on this wedding?
-- ---------------------------------------------------------------------------
-- Security definer so it is not itself subject to RLS on `people` (the same
-- reason is_collaborator is, 0002). search_path is pinned.
create or replace function public.can_plan(p_wedding_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.people p
    where p.wedding_id = p_wedding_id
      and p.user_id = auth.uid()
      and p.access = 'planner'
      and p.deleted_at is null
  );
$$;

revoke all on function public.can_plan(uuid) from public, anon;
grant execute on function public.can_plan(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The registry: one row per table in `public`, and what a planner may do.
-- ---------------------------------------------------------------------------
--   write   read and write (tasks, vendors, events)
--   read    read only
--   denied  nothing at all (the budget, credentials, the couple's private data)
--   global  no wedding_id column; nothing to scope, nothing granted here
--
-- Data, not an array in a DO block, so a test can compare it with pg_tables.
create table public.planner_table_access (
  table_name text primary key,
  access     text not null check (access in ('write', 'read', 'denied', 'global')),
  note       text
);
alter table public.planner_table_access enable row level security;
alter table public.planner_table_access force row level security;
revoke all on public.planner_table_access from anon, authenticated;

insert into public.planner_table_access (table_name, access, note) values
  -- tasks, vendors, the day: the planner's working surface
  ('lists',                 'write',  null),
  ('list_sections',         'write',  null),
  ('list_items',            'write',  null),
  ('events',                'write',  null),
  ('run_sheet_items',       'write',  null),
  ('vendors',               'write',  null),
  ('vendor_contacts',       'write',  null),
  ('vendor_notes',          'write',  null),
  ('vendor_categories',     'write',  null),
  -- guests: names, households, answers -- read only
  ('guests',                'read',   'dietary and accessibility notes included (spec 39 Q3)'),
  ('households',            'read',   'carries slug_suffix, the household page credential'),
  ('guest_tags',            'read',   null),
  ('tags',                  'read',   null),
  ('guest_notes',           'read',   null),
  ('guest_event_overrides', 'read',   null),
  ('invitation_events',     'read',   null),
  ('invitation_views',      'read',   null),
  ('rsvps',                 'read',   null),
  ('rsvp_questions',        'read',   null),
  ('rsvp_answers',          'read',   null),
  ('cut_lines',             'read',   null),
  ('household_slug_aliases','read',   null),
  -- the site, travel, seating, registry items: read only
  ('site_content',          'read',   null),
  ('site_blocks',           'read',   null),
  ('site_assets',           'read',   null),
  ('site_revisions',        'read',   null),
  ('site_visits',           'read',   null),
  ('song_requests',         'read',   null),
  ('song_votes',            'read',   null),
  ('dress_codes',           'read',   null),
  ('dress_code_notes',      'read',   null),
  ('gift_funds',            'read',   null),
  ('transport_options',     'read',   null),
  ('arrival_points',        'read',   null),
  ('coach_runs',            'read',   null),
  ('coach_stops',           'read',   null),
  ('coach_seats',           'read',   null),
  ('accommodations',        'read',   null),
  ('seating_plans',         'read',   null),
  ('seating_tables',        'read',   null),
  ('seating_fixtures',      'read',   null),
  ('seat_assignments',      'read',   null),
  ('seating_rules',         'read',   null),
  ('seating_snapshots',     'read',   null),
  ('moodboards',            'read',   null),
  ('moodboard_items',       'read',   null),
  ('registry_items',        'read',   null),
  ('registry_settings',     'read',   null),
  ('registry_tags',         'read',   null),
  ('registry_item_tags',    'read',   null),
  -- who can be assigned a task: names only, never emails (those are in auth)
  ('collaborators',         'read',   'user_id, role, display_name: needed to label assignees'),
  ('people',                'read',   null),
  -- the budget: not granted
  ('budget_categories',     'denied', 'the budget'),
  ('budget_items',          'denied', 'the budget'),
  ('payments',              'denied', 'the budget'),
  ('consumption_components','denied', 'the budget'),
  ('budget_item_lists',     'denied', 'the budget'),
  ('budget_item_sections',  'denied', 'the budget'),
  ('budget_item_tasks',     'denied', 'the budget'),
  -- the couple's private data and credentials
  ('gift_bank_details',     'denied', 'bank account'),
  ('registry_shipping',     'denied', 'delivery address'),
  ('registry_claims',       'denied', 'who is buying what'),
  ('invitations',           'denied', 'holds invitation link credentials'),
  ('moodboard_shares',      'denied', 'share link credentials'),
  ('moodboard_clip_tokens', 'denied', 'clipper credentials'),
  ('pinterest_accounts',    'denied', 'Pinterest credentials'),
  ('message_log',           'denied', 'email log'),
  ('guest_questions',       'denied', 'private to the couple'),
  ('saved_views',           'denied', 'per-collaborator'),
  ('audit_log',             'denied', 'activity page (spec 39 Q2)'),
  ('planner_table_access',  'denied', 'this table'),
  -- no wedding_id: nothing to scope
  ('weddings',              'global', 'planner reads v_wedding_basics instead: total_budget is a column here'),
  ('list_templates',        'global', null),
  ('rsvp_token_attempts',   'global', null);

-- ---------------------------------------------------------------------------
-- The additive policies
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select table_name, access from public.planner_table_access
            where access in ('read', 'write') loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_plan(wedding_id))',
      r.table_name || '_planner_read', r.table_name);

    if r.access = 'write' then
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (public.can_plan(wedding_id))',
        r.table_name || '_planner_insert', r.table_name);
      execute format(
        'create policy %I on public.%I for update to authenticated '
        'using (public.can_plan(wedding_id)) with check (public.can_plan(wedding_id))',
        r.table_name || '_planner_update', r.table_name);
      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.can_plan(wedding_id))',
        r.table_name || '_planner_delete', r.table_name);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- The wedding row, without the money
-- ---------------------------------------------------------------------------
-- `weddings.total_budget` is a column and RLS is per row, so a planner policy
-- on `weddings` would hand them the figure. They get NO policy on the table;
-- this view (owner's rights, scoped by can_plan) is how they read the rest.
-- Every column of `weddings` except total_budget, in the table's own order.
create view public.v_wedding_basics as
select
  w.id,
  w.name,
  w.slug,
  w.wedding_date,
  w.timezone,
  w.capacity,
  w.rsvp_lock_at,
  w.invite_send_on,
  w.reminder_window_days,
  w.created_at,
  w.updated_at
from public.weddings w
where public.can_plan(w.id);

revoke all on public.v_wedding_basics from public, anon;
grant select on public.v_wedding_basics to authenticated;
