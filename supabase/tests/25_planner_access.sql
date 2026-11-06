-- ===========================================================================
-- Planner access (migration 0044, spec 39 part C)
-- ===========================================================================
-- The failure that matters here is a LEAK: the planner reading the budget, the
-- total budget, bank details, or another wedding. Every assertion below that
-- says "sees nothing" is also run against a table that has rows, so a zero is
-- never just an empty table.
\set ON_ERROR_STOP on
\o /dev/null

\set alex '''aaaaaaaa-0000-4000-8000-000000000001'''
\set stranger '''cccccccc-0000-4000-8000-000000000003'''
\set pat '''dddddddd-0000-4000-8000-000000000004'''
\set w1 '''11111111-1111-4111-8111-111111111111'''
\set w2 '''22222222-2222-4222-8222-222222222222'''
\set item1 '''b3111111-1111-4111-8111-111111111111'''

create or replace function pg_temp.expect(actual bigint, wanted bigint, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function pg_temp.expect_true(actual boolean, label text)
returns void language plpgsql as $$
begin
  if actual is not true then
    raise exception 'FAIL % — expected true', label;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function pg_temp.expect_fails(p_sql text, p_label text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL % — it was allowed', p_label;
exception when others then
  if sqlerrm like 'FAIL %' then raise; end if;
  raise notice '  ok  %', p_label;
end;
$$;

-- Row count of a table as whoever the session currently is. Dynamic so the
-- same loop can walk every table.
create or replace function pg_temp.rows_in(p_table text)
returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from public.%I', p_table) into n;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Setup (as the table owner): one planner on wedding 1, nobody on wedding 2.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values (:pat, 'planner@example.test');
insert into public.people (id, wedding_id, name, user_id, access)
values ('a9000000-0000-4000-8000-0000000000a1', :w1, 'Pat (planner)', :pat, 'planner');

-- Give the budget and the private tables rows in BOTH weddings so a count of
-- zero means "RLS hid them", not "there was nothing".
insert into public.budget_categories (id, wedding_id, name)
values ('bc000000-0000-4000-8000-000000000001', :w1, 'Planner test category')
on conflict do nothing;
update public.weddings set total_budget = 1234500 where id = :w1;
-- A real budget line on a real vendor, so v_vendors has money to hide.
insert into public.budget_items (id, wedding_id, category_id, label, contracted, vendor_id)
select 'b1000000-0000-4000-8000-000000000001', :w1, 'bc000000-0000-4000-8000-000000000001',
       'Planner test line', 500000, id
  from public.vendors where wedding_id = :w1 order by id limit 1;

-- The registry is closed to signed-in users (tested below), so the loop that
-- runs AS the planner reads a copy taken here, as the owner.
create temp table denied_tables as
  select table_name from public.planner_table_access
   where access = 'denied' and table_name <> 'planner_table_access';
grant select on denied_tables to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Coverage: every table is decided, and nothing in the registry is stale
-- ---------------------------------------------------------------------------
select pg_temp.expect(
  (select count(*) from pg_tables t
    where t.schemaname = 'public'
      and not exists (select 1 from public.planner_table_access a where a.table_name = t.tablename)),
  0,
  'every table in public has a planner decision (add new tables to planner_table_access)');
select pg_temp.expect(
  (select count(*) from public.planner_table_access a
    where not exists (select 1 from pg_tables t where t.schemaname = 'public' and t.tablename = a.table_name)),
  0,
  'the registry names no table that does not exist');

-- Policies match the registry exactly: planner policies on read/write tables,
-- none on denied or global ones.
select pg_temp.expect(
  (select count(*) from pg_policies p
     join public.planner_table_access a on a.table_name = p.tablename
    where p.schemaname = 'public' and p.policyname like '%\_planner\_%'
      and a.access in ('denied', 'global')),
  0,
  'no denied or global table carries a planner policy');
select pg_temp.expect(
  (select count(*) from public.planner_table_access a
    where a.access = 'read'
      and (select count(*) from pg_policies p
            where p.schemaname = 'public' and p.tablename = a.table_name
              and p.policyname like '%\_planner\_%') <> 1),
  0,
  'a read table has exactly one planner policy');
select pg_temp.expect(
  (select count(*) from public.planner_table_access a
    where a.access = 'write'
      and (select count(*) from pg_policies p
            where p.schemaname = 'public' and p.tablename = a.table_name
              and p.policyname like '%\_planner\_%') <> 4),
  0,
  'a write table has exactly four planner policies (select, insert, update, delete)');

-- The couple's own policies are unchanged: still one `for all` collaborator
-- policy per tenant table, still keyed on is_collaborator.
select pg_temp.expect(
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.policyname like '%\_planner\_%'
      and (coalesce(p.qual, '') || coalesce(p.with_check, '')) not like '%can_plan%'),
  0,
  'every planner policy is keyed on can_plan, never on is_collaborator');

-- ---------------------------------------------------------------------------
-- 2. The planner is not a collaborator
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :pat, false);
select pg_temp.expect((select case when public.is_collaborator(:w1) then 1 else 0 end), 0,
  'the planner is not a collaborator');
select pg_temp.expect((select case when public.can_plan(:w1) then 1 else 0 end), 1,
  'the planner can plan their wedding');
select pg_temp.expect((select case when public.can_plan(:w2) then 1 else 0 end), 0,
  'the planner cannot plan another wedding');
select set_config('request.jwt.claim.sub', :alex, false);
select pg_temp.expect((select case when public.can_plan(:w1) then 1 else 0 end), 0,
  'a collaborator is not thereby a planner');
select pg_temp.expect((select case when public.is_collaborator(:w1) then 1 else 0 end), 1,
  'and the couple are still collaborators');
reset role;

-- ---------------------------------------------------------------------------
-- 3. What the planner sees
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :pat, false);

select pg_temp.expect((select count(*) from public.lists where wedding_id = :w1), 1,
  'the planner sees the wedding''s lists');
select pg_temp.expect((select count(*) from public.vendors), 3, 'the planner sees vendors');
select pg_temp.expect_true((select count(*) from public.guests where wedding_id = :w1) > 0,
  'the planner sees guests');
select pg_temp.expect_true(pg_temp.rows_in('events') > 0, 'the planner sees events');

-- Never another wedding's rows, in any table with rows there.
select pg_temp.expect((select count(*) from public.lists where wedding_id = :w2), 0,
  'the planner sees none of another wedding''s lists');
select pg_temp.expect((select count(*) from public.guests where wedding_id = :w2), 0,
  'nor its guests');

-- Every denied table: the planner sees nothing, whatever it holds.
do $$
declare r record;
begin
  for r in select table_name from denied_tables loop
    if pg_temp.rows_in(r.table_name) <> 0 then
      raise exception 'FAIL planner read % rows of denied table %', pg_temp.rows_in(r.table_name), r.table_name;
    end if;
  end loop;
  raise notice '  ok  the planner reads zero rows from every denied table';
end;
$$;

-- The budget views are security_invoker, so they hide it too.
select pg_temp.expect((select count(*) from public.v_budget_items), 0, 'v_budget_items is empty for the planner');
select pg_temp.expect((select count(*) from public.v_budget_summary), 0, 'v_budget_summary is empty for the planner');
select pg_temp.expect((select count(*) from public.v_budget_category_totals), 0,
  'v_budget_category_totals is empty for the planner');

-- The wedding row: not on the table, and total_budget is not in the view.
select pg_temp.expect((select count(*) from public.weddings), 0,
  'the planner cannot read the weddings table at all');
select pg_temp.expect((select count(*) from public.v_wedding_basics), 1,
  'the planner reads their wedding through v_wedding_basics');
select pg_temp.expect(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'v_wedding_basics' and column_name = 'total_budget'),
  0,
  'v_wedding_basics has no total_budget column');
select pg_temp.expect_fails($$select total_budget from public.v_wedding_basics$$,
  'the total budget cannot be selected through the view');
select pg_temp.expect((select count(total_budget) from public.weddings), 0,
  'nor read from the table (no row comes back to carry it)');
reset role;

-- And the couple are NOT shown less than before: Alex still sees everything
-- the planner is denied, and the total budget.
set role authenticated;
select set_config('request.jwt.claim.sub', :alex, false);
select pg_temp.expect((select count(*) from public.budget_categories where name = 'Planner test category'), 1,
  'the couple still see the budget');
select pg_temp.expect((select total_budget from public.weddings where id = :w1), 1234500,
  'the couple still see total_budget');
select pg_temp.expect((select count(*) from public.v_wedding_basics), 0,
  'the couple get nothing from the planner view (they have the table)');
reset role;

-- ---------------------------------------------------------------------------
-- 4. What the planner may write
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :pat, false);

update public.list_items set title = 'Order the aisle runner (planner edit)' where id = :item1;
select pg_temp.expect((select count(*) from public.list_items where id = :item1
  and title = 'Order the aisle runner (planner edit)'), 1, 'the planner can edit a task');

select pg_temp.expect_fails(
  $$insert into public.list_items (wedding_id, list_id, title)
    values ('22222222-2222-4222-8222-222222222222', 'b1111111-1111-4111-8111-0000000000ff', 'x')$$,
  'the planner cannot add a task to another wedding');

insert into public.vendor_notes (wedding_id, vendor_id, body)
select :w1, id, 'Called, will confirm Friday' from public.vendors limit 1;
select pg_temp.expect((select count(*) from public.vendor_notes where body = 'Called, will confirm Friday'), 1,
  'the planner can add a vendor note');

-- Read-only tables: a write is refused (insert) or touches nothing (update).
select pg_temp.expect_fails(
  $$insert into public.tags (wedding_id, name) values ('11111111-1111-4111-8111-111111111111', 'sneaky')$$,
  'the planner cannot add a tag (read-only table)');
update public.guests set first_name = 'Changed' where wedding_id = :w1;
select pg_temp.expect((select count(*) from public.guests where first_name = 'Changed'), 0,
  'the planner cannot edit a guest');
delete from public.guests where wedding_id = :w1;
select pg_temp.expect_true((select count(*) from public.guests where wedding_id = :w1) > 0,
  'the planner cannot delete guests');

-- Denied tables refuse writes too.
select pg_temp.expect_fails(
  $$insert into public.budget_categories (wedding_id, name) values ('11111111-1111-4111-8111-111111111111', 'sneaky')$$,
  'the planner cannot write to the budget');
update public.weddings set total_budget = 1 where id = :w1;

-- The planner cannot grant themselves anything.
update public.people set access = 'none' where user_id = :pat;
select pg_temp.expect((select count(*) from public.people where access = 'planner'), 1,
  'the planner cannot edit people (their own access included)');
select pg_temp.expect_fails(
  $$insert into public.people (wedding_id, name) values ('11111111-1111-4111-8111-111111111111', 'Pal')$$,
  'the planner cannot add people');
reset role;

select pg_temp.expect((select total_budget from public.weddings where id = :w1), 1234500,
  'the planner''s attempt to change total_budget touched nothing');

-- ---------------------------------------------------------------------------
-- 5. Revoking is immediate, and so is a removed planner
-- ---------------------------------------------------------------------------
update public.people set access = 'none' where user_id = :pat;
set role authenticated;
select set_config('request.jwt.claim.sub', :pat, false);
select pg_temp.expect((select count(*) from public.lists), 0,
  'access = none: the planner sees nothing, at once');
select pg_temp.expect((select count(*) from public.v_wedding_basics), 0,
  'and not the wedding view either');
reset role;

update public.people set access = 'planner', deleted_at = now() where user_id = :pat;
set role authenticated;
select set_config('request.jwt.claim.sub', :pat, false);
select pg_temp.expect((select count(*) from public.lists), 0,
  'a removed person with planner access sees nothing');
reset role;
update public.people set deleted_at = null where user_id = :pat;

-- A stranger and anon see none of this either.
set role authenticated;
select set_config('request.jwt.claim.sub', :stranger, false);
select pg_temp.expect((select count(*) from public.people where wedding_id = :w1), 0,
  'a stranger sees no people');
reset role;
set role anon;
select pg_temp.expect_fails($$select * from public.v_wedding_basics$$, 'anon cannot read the wedding view');
reset role;
set role authenticated;
select pg_temp.expect_fails($$select * from public.planner_table_access$$,
  'the registry itself is closed to signed-in users');
reset role;

-- ---------------------------------------------------------------------------
-- 6. The views the guest and vendor pages use still work for a planner
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :pat, false);
select pg_temp.expect((select count(*) from public.v_households), 10, 'v_households works for the planner');
select pg_temp.expect((select count(*) from public.v_guest_event_invites), 54,
  'v_guest_event_invites works for the planner');
select pg_temp.expect((select count(*) from public.v_vendors), 3, 'v_vendors works for the planner');
reset role;
select pg_temp.expect_true((select coalesce(sum(committed), 0) from public.v_vendors) > 0,
  'sanity: as the owner, v_vendors does show the money');
set role authenticated;
select set_config('request.jwt.claim.sub', :pat, false);
-- ...but carries no money: the planner reads no budget line to sum.
select pg_temp.expect((select count(*) from public.v_vendors where budget_line_count > 0), 0,
  'v_vendors shows the planner no budget lines');
select pg_temp.expect((select coalesce(sum(committed), 0)::bigint from public.v_vendors), 0,
  'v_vendors shows the planner no committed money');
reset role;

\o
\echo '25_planner_access: ok'
