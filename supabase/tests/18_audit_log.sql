-- ===========================================================================
-- Audit log tests (spec 32, migration 0035)
-- ===========================================================================
-- The assertions that matter:
--   * every kind of write produces the right row, with the right actor;
--   * an update that changed only ordering churn (`updated_at`, `rank`,
--     `sort_order`) writes NOTHING (Q5) — otherwise one drag re-numbers dozens
--     of rows and the log fills with noise;
--   * secret values are never copied into the log;
--   * the log is append-only, even for its owner, and unreadable across
--     weddings;
--   * every table that carries wedding data is audited or deliberately not —
--     a new table that is neither fails this file, which is the point.
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null

\set alex     '''aaaaaaaa-0000-4000-8000-000000000001'''
\set stranger '''cccccccc-0000-4000-8000-000000000003'''
\set w1       '''11111111-1111-4111-8111-111111111111'''
\set w2       '''22222222-2222-4222-8222-222222222222'''
\set ceremony '''e1111111-1111-4111-8111-111111111111'''

create or replace function pg_temp.expect(actual bigint, wanted bigint, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function pg_temp.expect_text(actual text, wanted text, label text)
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

-- The seed wrote audit rows of its own; everything below counts from here.
create temp table baseline as select coalesce(max(id), 0) as id from public.audit_log;
grant select on baseline to public;

create or replace function pg_temp.since(p_table text)
returns bigint language sql stable as $$
  select count(*) from public.audit_log a, baseline b
   where a.id > b.id and a.table_name = p_table;
$$;

-- ---------------------------------------------------------------------------
-- 1. A planner's insert, update and delete
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

insert into public.tags (id, wedding_id, name)
values ('7a000000-0000-4000-8000-000000000001', :w1, 'Audit me');

update public.tags set name = 'Audit me, renamed'
 where id = '7a000000-0000-4000-8000-000000000001';

delete from public.tags where id = '7a000000-0000-4000-8000-000000000001';

reset role;

select pg_temp.expect(pg_temp.since('tags'), 3, 'insert, update and delete each wrote one row');

select pg_temp.expect_text(
  (select action from public.audit_log where table_name = 'tags' order by id desc limit 1 offset 2),
  'insert', 'first row is the insert');
select pg_temp.expect_text(
  (select actor_id::text from public.audit_log where table_name = 'tags' order by id desc limit 1),
  'aaaaaaaa-0000-4000-8000-000000000001', 'the actor is the signed-in planner');
select pg_temp.expect_text(
  (select actor_kind from public.audit_log where table_name = 'tags' order by id desc limit 1),
  'planner', 'and the kind is planner');
select pg_temp.expect_text(
  (select row_key ->> 'id' from public.audit_log where table_name = 'tags' order by id desc limit 1),
  '7a000000-0000-4000-8000-000000000001', 'row_key carries the primary key');
select pg_temp.expect_text(
  (select label from public.audit_log where table_name = 'tags' order by id desc limit 1),
  'Audit me, renamed', 'a delete is labelled with the name the row had');

-- The update is a diff: the changed column as [old, new], and no updated_at.
select pg_temp.expect_text(
  (select changed::text from public.audit_log
    where table_name = 'tags' and action = 'update' order by id desc limit 1),
  '{"name": ["Audit me", "Audit me, renamed"]}', 'an update records only what changed, as [old, new]');

-- A delete keeps the whole row, which is what lets you bring it back.
select pg_temp.expect_text(
  (select changed ->> 'name' from public.audit_log
    where table_name = 'tags' and action = 'delete' order by id desc limit 1),
  'Audit me, renamed', 'a delete keeps the whole row');
select pg_temp.expect_true(
  (select changed ? 'wedding_id' from public.audit_log
    where table_name = 'tags' and action = 'delete' order by id desc limit 1),
  'including wedding_id');
rollback;

-- ---------------------------------------------------------------------------
-- 2. Ordering churn writes nothing; a real change still does
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

update public.events set sort_order = sort_order + 10 where id = :ceremony;
reset role;
select pg_temp.expect(pg_temp.since('events'), 0,
  'a sort_order-only update wrote nothing (updated_at moved too)');

set local role authenticated;
update public.events set name = name where id = :ceremony;
reset role;
select pg_temp.expect(pg_temp.since('events'), 0, 'an update that changed nothing wrote nothing');

set local role authenticated;
update public.events set sort_order = sort_order + 1, venue = 'Somewhere else' where id = :ceremony;
reset role;
select pg_temp.expect(pg_temp.since('events'), 1, 'a real change alongside sort_order still writes one row');
select pg_temp.expect_true(
  (select changed ? 'sort_order' and changed ? 'venue' and not changed ? 'updated_at'
     from public.audit_log where table_name = 'events' order by id desc limit 1),
  'and its diff has both columns but never updated_at');
rollback;

-- ---------------------------------------------------------------------------
-- 3. A write with no signed-in user is "public"
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
update public.events set venue = 'Changed by the public path' where id = :ceremony;
reset role;

select pg_temp.expect_text(
  (select actor_kind from public.audit_log where table_name = 'events' order by id desc limit 1),
  'public', 'a service-role write is recorded as public');
select pg_temp.expect_true(
  (select actor_id is null from public.audit_log where table_name = 'events' order by id desc limit 1),
  'with no actor');
rollback;

-- ---------------------------------------------------------------------------
-- 4. Secrets are never copied into the log
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
insert into public.gift_bank_details (wedding_id, account_name, account_number)
values (:w1, 'A. Bride', '123456789012345')
on conflict (wedding_id) do update
  set account_name = excluded.account_name, account_number = excluded.account_number;
update public.gift_bank_details set account_number = '999999999999999' where wedding_id = :w1;

insert into public.invitations (id, wedding_id, household_id, token_hash, token_encrypted)
values ('7a000000-0000-4000-8000-000000000002', :w1,
        'd0000000-0000-4000-8000-000000000001', 'secret-hash-value', 'secret-ciphertext-value');
reset role;

select pg_temp.expect_text(
  (select changed ->> 'account_number' from public.audit_log
    where table_name = 'gift_bank_details' order by id desc limit 1),
  '[redacted]', 'a changed bank account number is logged as [redacted]');
select pg_temp.expect(
  (select count(*) from public.audit_log
    where table_name = 'gift_bank_details'
      and (changed::text like '%999999999999999%' or changed::text like '%123456789012345%')),
  0, 'neither the old nor the new account number appears anywhere');
select pg_temp.expect(
  (select count(*) from public.audit_log
    where table_name = 'invitations'
      and (changed::text like '%secret-hash-value%' or changed::text like '%secret-ciphertext-value%')),
  0, 'invitation token hash and ciphertext are not in the log');
select pg_temp.expect_text(
  (select changed ->> 'token_hash' from public.audit_log
    where table_name = 'invitations' order by id desc limit 1),
  '[redacted]', 'but the invitation insert is still logged, with the secret redacted');
rollback;

-- ---------------------------------------------------------------------------
-- 5. Who can read it
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.expect_true(
  (select count(*) from public.audit_log where wedding_id = :w1) > 0,
  'a collaborator reads their own wedding''s log');
select pg_temp.expect(
  (select count(*) from public.audit_log where wedding_id = :w2), 0,
  'and sees nothing of the other wedding''s');
rollback;

begin;
select set_config('request.jwt.claim.sub', :stranger, true);
set local role authenticated;
select pg_temp.expect(
  (select count(*) from public.audit_log where wedding_id = :w1), 0,
  'the second account sees none of wedding 1''s log');
rollback;

-- ---------------------------------------------------------------------------
-- 6. Append-only
-- ---------------------------------------------------------------------------
create or replace function pg_temp.refuses(p_sql text, p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when insufficient_privilege then
    raise notice '  ok  %', p_label;
    return;
  end;
  raise exception 'FAIL % — it was allowed', p_label;
end;
$$;

begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.refuses('insert into public.audit_log (wedding_id, actor_kind, table_name, row_key, action, changed) '
  || 'values (''11111111-1111-4111-8111-111111111111'', ''public'', ''x'', ''{}'', ''insert'', ''{}'')',
  'a planner cannot write a log row by hand');
select pg_temp.refuses('update public.audit_log set label = ''x''', 'a planner cannot update the log');
select pg_temp.refuses('delete from public.audit_log', 'a planner cannot delete from the log');
rollback;

begin;
-- Even the owner, who bypasses RLS and holds every privilege.
select pg_temp.refuses('update public.audit_log set label = ''x''', 'the owner cannot update the log either');
select pg_temp.refuses('delete from public.audit_log', 'nor delete from it');
rollback;

-- ---------------------------------------------------------------------------
-- 7. Retention is the only way rows leave
-- ---------------------------------------------------------------------------
begin;
insert into public.audit_log (wedding_id, at, actor_kind, table_name, row_key, action, changed)
values (:w1, now() - interval '400 days', 'public', 'prune_probe', '{}', 'insert', '{}'),
       (:w1, now() - interval '10 days',  'public', 'prune_probe', '{}', 'insert', '{}');

do $$
begin
  begin
    perform public.prune_audit_log(7);
    raise exception 'FAIL — a 7-day window was allowed';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  ok  a keep window under 30 days is refused';
  end;
end;
$$;

select pg_temp.expect(public.prune_audit_log(365), 1,
  'prune removes exactly the row older than the window');
select pg_temp.expect(
  (select count(*) from public.audit_log where table_name = 'prune_probe'), 1,
  'and keeps the recent one');
select pg_temp.refuses('delete from public.audit_log', 'the prune flag does not outlive the call');
rollback;

-- ---------------------------------------------------------------------------
-- 8. Coverage: no table is audited by accident, or left out by accident
-- ---------------------------------------------------------------------------
-- A table added by a later migration fails here until it is either given the
-- trigger or added to this list with a reason. That is the whole point.
do $$
declare
  v_missing text;
  not_audited constant text[] := array[
    'audit_log',             -- itself
    'invitation_views',      -- tracking: who opened a page
    'site_visits',           -- tracking: page views
    'rsvp_token_attempts',   -- rate-limit bookkeeping
    'message_log',           -- already a log
    'site_revisions',        -- already a history
    'moodboard_clip_tokens', -- a credential
    'pinterest_accounts',    -- a credential
    'list_templates',        -- shared across weddings, no wedding_id
    'household_slug_aliases', -- derived from a household's name
    'seating_snapshots'      -- itself a saved copy; auditing it would duplicate the payload
  ];
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_missing
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relname <> all (not_audited)
     and not exists (
       select 1 from pg_trigger t
        where t.tgrelid = c.oid
          and t.tgname = 'audit_row'
          and not t.tgisinternal
     );
  if v_missing is not null then
    raise exception 'FAIL — unaudited tables with no stated reason: %', v_missing;
  end if;
  raise notice '  ok  every public table is audited or listed with a reason';

  select string_agg(x, ', ') into v_missing
    from unnest(not_audited) x
   where to_regclass('public.' || x) is null;
  if v_missing is not null then
    raise exception 'FAIL — the not-audited list names tables that no longer exist: %', v_missing;
  end if;
  raise notice '  ok  and the exceptions list names only real tables';
end;
$$;
