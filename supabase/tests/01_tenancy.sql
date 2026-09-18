-- ===========================================================================
-- Tenancy tests
-- ===========================================================================
-- The spec's instruction was: write the RLS policies in the first migration
-- and test them with a second account before you trust them. This is that
-- second account.
--
-- Two independent mechanisms are under test and they fail differently:
--   RLS           silently returns zero rows, or raises 42501 on write
--   composite FK  raises 23503 even for a role that bypasses RLS entirely
--
-- Both are checked, because each catches what the other misses: RLS stops a
-- logged-in human, the foreign key stops our own server code.
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null
\set alex     '''aaaaaaaa-0000-4000-8000-000000000001'''
\set sam      '''aaaaaaaa-0000-4000-8000-000000000002'''
\set stranger '''cccccccc-0000-4000-8000-000000000003'''
\set w1       '''11111111-1111-4111-8111-111111111111'''
\set w2       '''22222222-2222-4222-8222-222222222222'''

create or replace function pg_temp.expect(actual bigint, wanted bigint, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. A collaborator sees their own wedding, whole
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

select pg_temp.expect((select count(*) from public.households), 10, 'alex sees 10 households');
select pg_temp.expect((select count(*) from public.guests),     18, 'alex sees 18 guests');
select pg_temp.expect((select count(*) from public.events),       3, 'alex sees 3 events');
select pg_temp.expect((select count(*) from public.weddings),     1, 'alex sees exactly 1 wedding');

-- ---------------------------------------------------------------------------
-- 2. ...and nothing at all of the other wedding
-- ---------------------------------------------------------------------------
select pg_temp.expect(
  (select count(*) from public.households where wedding_id = :w2), 0,
  'alex sees no households from wedding 2');
select pg_temp.expect(
  (select count(*) from public.guests where wedding_id = :w2), 0,
  'alex sees no guests from wedding 2');
select pg_temp.expect(
  (select count(*) from public.weddings where id = :w2), 0,
  'alex cannot read wedding 2 itself');

-- ---------------------------------------------------------------------------
-- 3. Writes into the other wedding are refused, not silently dropped
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.households (wedding_id, display_name, rank)
    values ('22222222-2222-4222-8222-222222222222', 'Gatecrasher', 'zz');
    raise exception 'FAIL — insert into another wedding was allowed';
  exception
    when insufficient_privilege then
      raise notice '  ok  cross-wedding insert blocked by RLS';
  end;
end;
$$;

-- An UPDATE targeting invisible rows touches nothing rather than erroring:
-- the rows are simply not there to be matched.
do $$
declare touched int;
begin
  update public.households set display_name = 'Renamed'
  where wedding_id = '22222222-2222-4222-8222-222222222222';
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL — updated % row(s) in another wedding', touched;
  end if;
  raise notice '  ok  cross-wedding update affected 0 rows';
end;
$$;

do $$
declare touched int;
begin
  delete from public.guests where wedding_id = '22222222-2222-4222-8222-222222222222';
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL — deleted % row(s) in another wedding', touched;
  end if;
  raise notice '  ok  cross-wedding delete affected 0 rows';
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 4. The other couple sees their wedding and only theirs
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :stranger, true);
set local role authenticated;
select pg_temp.expect((select count(*) from public.households), 1, 'stranger sees only their household');
select pg_temp.expect((select count(*) from public.guests),     1, 'stranger sees only their guest');
select pg_temp.expect(
  (select count(*) from public.guests where wedding_id = :w1), 0,
  'stranger sees nothing of wedding 1');
rollback;

-- ---------------------------------------------------------------------------
-- 5. A signed-out visitor (anon) is granted nothing at all
-- ---------------------------------------------------------------------------
-- Not "RLS returns no rows" — the grant itself is gone, so the request fails
-- at the privilege check. A future policy mistake therefore cannot become an
-- exposure on its own.
begin;
set local role anon;
do $$
begin
  begin
    perform count(*) from public.guests;
    raise exception 'FAIL — anon could query guests';
  exception
    when insufficient_privilege then
      raise notice '  ok  anon has no privilege on guests';
  end;
  begin
    perform count(*) from public.weddings;
    raise exception 'FAIL — anon could query weddings';
  exception
    when insufficient_privilege then
      raise notice '  ok  anon has no privilege on weddings';
  end;

  -- The invitations table holds token hashes. If anon could read it, the
  -- throttle and the hashing would both be beside the point.
  begin
    perform count(*) from public.invitations;
    raise exception 'FAIL — anon could query invitations';
  exception
    when insufficient_privilege then
      raise notice '  ok  anon has no privilege on invitations';
  end;
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 5b. The throttle table is service-role only, including for collaborators
-- ---------------------------------------------------------------------------
-- It has no RLS policy at all, deliberately. A signed-in collaborator has no
-- reason to read it, and it is the one table with no wedding to scope it to.
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
do $$
begin
  begin
    perform count(*) from public.rsvp_token_attempts;
    raise exception 'FAIL — a collaborator could read the throttle table';
  exception
    when insufficient_privilege then
      raise notice '  ok  throttle table is unreachable by collaborators';
  end;
end;
$$;
rollback;

begin;
set local role service_role;
insert into public.rsvp_token_attempts (ip_hash, succeeded) values ('deadbeef', false);
select pg_temp.expect((select count(*) from public.rsvp_token_attempts), 1,
  'service role can record a failed token attempt');
rollback;

-- ---------------------------------------------------------------------------
-- 6. The composite foreign key stops what RLS cannot
-- ---------------------------------------------------------------------------
-- service_role bypasses RLS by design — it is what the public RSVP path runs
-- as. So tenancy for our own server code rests on the foreign key, not on a
-- policy. Prove it holds even with RLS out of the picture.
begin;
set local role service_role;
do $$
begin
  begin
    insert into public.guests (wedding_id, household_id, first_name)
    values ('11111111-1111-4111-8111-111111111111',   -- wedding 1
            'd0000000-0000-4000-8000-0000000000ff',   -- household in wedding 2
            'Impossible');
    raise exception 'FAIL — guest attached to a household in another wedding';
  exception
    when foreign_key_violation then
      raise notice '  ok  composite FK refused a cross-wedding guest';
  end;

  begin
    insert into public.invitation_events (wedding_id, invitation_id, event_id)
    values ('22222222-2222-4222-8222-222222222222',
            gen_random_uuid(),
            'e1111111-1111-4111-8111-111111111111');
    raise exception 'FAIL — invitation_events accepted a cross-wedding event';
  exception
    when foreign_key_violation then
      raise notice '  ok  composite FK refused a cross-wedding invitation event';
  end;
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 7. Saved views are private to one collaborator, not shared across the couple
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
insert into public.saved_views (wedding_id, user_id, name, filters)
values (:w1, :alex, 'Alex only', '{"tier":"A"}');
set local role authenticated;
select set_config('request.jwt.claim.sub', :sam, true);
select pg_temp.expect((select count(*) from public.saved_views), 0,
  'sam cannot see alex''s saved view');
select set_config('request.jwt.claim.sub', :alex, true);
select pg_temp.expect((select count(*) from public.saved_views), 1,
  'alex can see their own saved view');
rollback;

-- ---------------------------------------------------------------------------
-- 8. Derived reads respect the same boundary
-- ---------------------------------------------------------------------------
-- A view without security_invoker would run as its owner and leak every
-- wedding through the dashboard.
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.expect((select count(*) from public.v_wedding_stats), 1,
  'v_wedding_stats shows one wedding to alex');
select pg_temp.expect((select count(*) from public.v_households), 10,
  'v_households is scoped to alex''s wedding');
rollback;

-- ---------------------------------------------------------------------------
-- 9. Lists + timeline (0004/0005) — the same boundary, on the newest tables
-- ---------------------------------------------------------------------------
-- No assertions existed for lists/list_sections/list_items before this —
-- see docs/HANDOFF.md section 1's note that the 0004 assertion count was
-- unchanged from before those tables landed. This closes that gap.
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

select pg_temp.expect((select count(*) from public.lists), 1, 'alex sees 1 list');
select pg_temp.expect((select count(*) from public.list_sections), 1, 'alex sees 1 section');
select pg_temp.expect((select count(*) from public.list_items), 2, 'alex sees 2 items');
select pg_temp.expect(
  (select count(*) from public.v_timeline_items), 1,
  'v_timeline_items shows only the one dated item, not the undated one');

select pg_temp.expect(
  (select count(*) from public.lists where wedding_id = :w2), 0,
  'alex sees no lists from wedding 2');
select pg_temp.expect(
  (select count(*) from public.list_items where wedding_id = :w2), 0,
  'alex sees no list items from wedding 2');

do $$
begin
  begin
    insert into public.lists (wedding_id, title)
    values ('22222222-2222-4222-8222-222222222222', 'Gatecrasher list');
    raise exception 'FAIL — insert into another wedding''s lists was allowed';
  exception
    when insufficient_privilege then
      raise notice '  ok  cross-wedding list insert blocked by RLS';
  end;
end;
$$;
rollback;

begin;
select set_config('request.jwt.claim.sub', :stranger, true);
set local role authenticated;
select pg_temp.expect((select count(*) from public.lists), 1, 'stranger sees only their list');
select pg_temp.expect((select count(*) from public.list_items), 1, 'stranger sees only their item');
select pg_temp.expect(
  (select count(*) from public.list_items where wedding_id = :w1), 0,
  'stranger sees nothing of wedding 1''s lists');
rollback;

-- list_templates: readable by every authenticated collaborator, writable by
-- nobody through the API (0004) — reference data, not tenant data.
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
do $$
begin
  begin
    insert into public.list_templates (key, title) values ('rogue', 'Rogue template');
    raise exception 'FAIL — a collaborator could write to list_templates';
  exception
    when insufficient_privilege then
      raise notice '  ok  list_templates is read-only to collaborators';
  end;
end;
$$;
rollback;

begin;
set local role anon;
do $$
begin
  begin
    perform count(*) from public.list_templates;
    raise exception 'FAIL — anon could query list_templates';
  exception
    when insufficient_privilege then
      raise notice '  ok  anon has no privilege on list_templates';
  end;
  begin
    perform count(*) from public.lists;
    raise exception 'FAIL — anon could query lists';
  exception
    when insufficient_privilege then
      raise notice '  ok  anon has no privilege on lists';
  end;
end;
$$;
rollback;

-- The composite foreign key stops what RLS cannot, same as section 6.
begin;
set local role service_role;
do $$
begin
  begin
    insert into public.list_items (wedding_id, list_id, title)
    values ('11111111-1111-4111-8111-111111111111',   -- wedding 1
            'b1111111-1111-4111-8111-0000000000ff',   -- list in wedding 2
            'Impossible');
    raise exception 'FAIL — list item attached to a list in another wedding';
  exception
    when foreign_key_violation then
      raise notice '  ok  composite FK refused a cross-wedding list item';
  end;
end;
$$;
rollback;

-- One level of sub-items, and the parent-status auto-derivation (0005).
begin;
set local role service_role;
do $$
declare
  parent_id uuid;
  child_a_id uuid;
  child_b_id uuid;
  parent_status public.list_item_status;
begin
  insert into public.list_items (wedding_id, list_id, title)
  values ('11111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', 'Parent task')
  returning id into parent_id;

  -- Two children: "some but not all done" only shows up with more than one.
  insert into public.list_items (wedding_id, list_id, parent_item_id, title)
  values ('11111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', parent_id, 'Child A')
  returning id into child_a_id;
  insert into public.list_items (wedding_id, list_id, parent_item_id, title)
  values ('11111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', parent_id, 'Child B')
  returning id into child_b_id;

  begin
    insert into public.list_items (wedding_id, list_id, parent_item_id, title)
    values ('11111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', child_a_id, 'Grandchild');
    raise exception 'FAIL — a sub-item was allowed to have its own sub-item';
  exception
    when others then
      if sqlerrm !~ 'one level of nesting' then
        raise exception 'FAIL — wrong error blocked grandchild insert: %', sqlerrm;
      end if;
      raise notice '  ok  one level of nesting is enforced';
  end;

  update public.list_items set status = 'done', done_at = now() where id = child_a_id;
  select status into parent_status from public.list_items where id = parent_id;
  if parent_status <> 'in_progress' then
    raise exception 'FAIL — parent did not auto-derive in_progress, got %', parent_status;
  end if;
  raise notice '  ok  parent auto-derives in_progress when some (not all) sub-items are done';

  update public.list_items set status = 'done', done_at = now() where id = child_b_id;
  select status into parent_status from public.list_items where id = parent_id;
  if parent_status <> 'in_progress' then
    raise exception 'FAIL — parent moved off in_progress once every sub-item was done, got %', parent_status;
  end if;
  raise notice '  ok  parent stays as last derived once every sub-item is done (no auto "done")';

  update public.list_items set status = 'not_started', done_at = null where id = child_a_id;
  update public.list_items set status = 'not_started', done_at = null where id = child_b_id;
  select status into parent_status from public.list_items where id = parent_id;
  if parent_status <> 'not_started' then
    raise exception 'FAIL — parent did not fall back to not_started, got %', parent_status;
  end if;
  raise notice '  ok  parent falls back to not_started when no sub-item is done';
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 10. Spec 15: collaborator display names, section notes, calculated due dates (0016, 0018)
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
do $$
declare
  section_id uuid;
  offset_item_id uuid;
  got_notes text;
  got_offset int;
  got_name text;
begin
  update public.collaborators set display_name = 'Alex'
    where wedding_id = '11111111-1111-4111-8111-111111111111'
      and user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  select display_name into got_name from public.collaborators
    where wedding_id = '11111111-1111-4111-8111-111111111111'
      and user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  if got_name <> 'Alex' then
    raise exception 'FAIL — collaborators.display_name did not round-trip, got %', got_name;
  end if;
  raise notice '  ok  collaborators.display_name round-trips';

  -- A section's free-text notes (0018) is independent of whatever checklist
  -- it also holds — every section gets one, not a separate "kind" of
  -- section (0016's short-lived version of this, retired the same
  -- migration).
  insert into public.list_sections (wedding_id, list_id, title)
  values ('11111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', 'Tuxedo')
  returning id into section_id;
  select notes into got_notes from public.list_sections where id = section_id;
  if got_notes is not null then
    raise exception 'FAIL — a new section''s notes should start null, got %', got_notes;
  end if;
  raise notice '  ok  list_sections.notes starts null';

  update public.list_sections
    set notes = 'Tried: Moss Bros (liked the navy), Suit Supply (too slim)'
    where id = section_id;
  select notes into got_notes from public.list_sections where id = section_id;
  if got_notes <> 'Tried: Moss Bros (liked the navy), Suit Supply (too slim)' then
    raise exception 'FAIL — list_sections.notes did not round-trip, got %', got_notes;
  end if;
  raise notice '  ok  list_sections.notes round-trips, alongside the section''s own tasks';

  insert into public.list_items (wedding_id, list_id, title, due_date, due_date_offset_days)
  values ('11111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111',
          'Book the venue', '2026-01-01', -14)
  returning id into offset_item_id;
  select due_date_offset_days into got_offset from public.list_items where id = offset_item_id;
  if got_offset <> -14 then
    raise exception 'FAIL — due_date_offset_days did not round-trip, got %', got_offset;
  end if;
  raise notice '  ok  list_items.due_date_offset_days round-trips';
end;
$$;
rollback;
