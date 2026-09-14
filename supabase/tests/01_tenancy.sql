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
end;
$$;
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
