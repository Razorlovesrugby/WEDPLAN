-- ===========================================================================
-- Seating share links (spec 57 E.3, migration 0061)
-- ===========================================================================
-- Asserted: a good link opens; a revoked, expired or unknown one doesn't; a
-- passcode is required and checked; five wrong passcodes lock the link; only
-- the service role can ask; and a collaborator manages links of their own
-- wedding but a stranger sees none.
\set ON_ERROR_STOP on
\o /dev/null

\set w1        '''11111111-1111-4111-8111-111111111111'''
\set alex      '''aaaaaaaa-0000-4000-8000-000000000001'''
\set stranger  '''cccccccc-0000-4000-8000-000000000003'''
\set reception '''e2222222-2222-4222-8222-222222222222'''

create or replace function pg_temp.expect_text(actual text, wanted text, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function pg_temp.expect_error(stmt text, code text, label text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL % — expected error %, none raised', label, code;
exception when others then
  if sqlstate = code then
    raise notice '  ok  %', label;
  elsif sqlstate = 'P0001' and sqlerrm like 'FAIL %' then
    raise;
  else
    raise exception 'FAIL % — expected %, got % (%)', label, code, sqlstate, sqlerrm;
  end if;
end;
$$;

begin;
-- As a collaborator, make links.
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
insert into public.seating_share_links (wedding_id, event_id, token_hash) values (:w1, :reception, 'open-token');
insert into public.seating_share_links (wedding_id, event_id, token_hash, passcode_hash) values (:w1, :reception, 'locked-token', 'right');
insert into public.seating_share_links (wedding_id, event_id, token_hash, revoked_at) values (:w1, :reception, 'revoked-token', now());
insert into public.seating_share_links (wedding_id, event_id, token_hash, expires_at) values (:w1, :reception, 'expired-token', now() - interval '1 day');
insert into public.seating_share_links (wedding_id, event_id, token_hash, expires_at) values (:w1, :reception, 'future-token', now() + interval '1 day');

select pg_temp.expect_text((select count(*)::text from public.seating_share_links), '5', 'a collaborator sees their links');
-- Neither a collaborator nor anon can ask the function: only the service role.
select pg_temp.expect_error($$select * from public.seating_share_check('open-token')$$, '42501', 'a signed-in user can''t call the check');
reset role;

set local role service_role;
select pg_temp.expect_text((select status from public.seating_share_check('open-token')), 'ok', 'a link with no passcode opens');
select pg_temp.expect_text((select event_id::text from public.seating_share_check('open-token')), 'e2222222-2222-4222-8222-222222222222', '… and says which event');
select pg_temp.expect_text((select status from public.seating_share_check('future-token')), 'ok', 'a link that expires tomorrow opens today');
select pg_temp.expect_text((select status from public.seating_share_check('nope')), 'gone', 'an unknown link is gone');
select pg_temp.expect_text((select status from public.seating_share_check('revoked-token')), 'gone', 'a revoked link is gone');
select pg_temp.expect_text((select status from public.seating_share_check('expired-token')), 'gone', 'an expired link is gone');
select pg_temp.expect_text((select event_id::text from public.seating_share_check('revoked-token')), null, 'and tells nothing about the event');

-- Passcodes.
select pg_temp.expect_text((select status from public.seating_share_check('locked-token')), 'passcode_required', 'a passcode is asked for');
select pg_temp.expect_text((select status from public.seating_share_check('locked-token', 'wrong')), 'wrong_passcode', 'a wrong one is refused');
select pg_temp.expect_text((select status from public.seating_share_check('locked-token', 'right')), 'ok', 'the right one opens it');
select pg_temp.expect_text((select event_id::text from public.seating_share_check('locked-token', 'wrong')), null, '… and a wrong one learns nothing');

-- Five wrong in a row lock it, even for the right passcode (counting from none).
update public.seating_share_links set failed_attempts = 0 where token_hash = 'locked-token';
select public.seating_share_check('locked-token', 'x1');
select public.seating_share_check('locked-token', 'x2');
select public.seating_share_check('locked-token', 'x3');
select public.seating_share_check('locked-token', 'x4');
select pg_temp.expect_text((select status from public.seating_share_check('locked-token', 'x5')), 'wrong_passcode', 'the fifth wrong passcode is still just refused');
select pg_temp.expect_text((select status from public.seating_share_check('locked-token', 'right')), 'locked', 'then the link is locked, even for the right passcode');
select pg_temp.expect_text((select (locked_until > now() + interval '14 minutes')::text from public.seating_share_links where token_hash = 'locked-token'), 'true', 'for fifteen minutes');
update public.seating_share_links set locked_until = now() - interval '1 second' where token_hash = 'locked-token';
select pg_temp.expect_text((select status from public.seating_share_check('locked-token', 'right')), 'ok', 'and opens again once the time has passed');
select pg_temp.expect_text((select failed_attempts::text from public.seating_share_links where token_hash = 'locked-token'), '0', 'a good passcode clears the count');
reset role;

-- A stranger sees none of them and can't add one.
select set_config('request.jwt.claim.sub', :stranger, true);
set local role authenticated;
select pg_temp.expect_text((select count(*)::text from public.seating_share_links), '0', 'a stranger sees no links');
select pg_temp.expect_error(format(
  'insert into public.seating_share_links (wedding_id, event_id, token_hash) values (%L, %L, ''mine'')', :w1, :reception), '42501',
  'and can''t make one for another wedding');
rollback;

begin;
set local role anon;
select pg_temp.expect_error($$select * from public.seating_share_check('x')$$, '42501', 'anon can''t call the check either');
select pg_temp.expect_error('select 1 from public.seating_share_links', '42501', 'or read the links');
rollback;
