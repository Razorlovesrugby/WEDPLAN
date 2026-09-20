-- ===========================================================================
-- Household addresses (spec 21, migration 0022)
-- ===========================================================================
-- The things worth asserting are the ones that only fail in production: a
-- name that strips down to nothing, two households racing for the same
-- address, a slug with a slash in it, and an UPDATE quietly clearing the
-- credential half.
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null

\set w1       '''11111111-1111-4111-8111-111111111111'''
\set stranger '''cccccccc-0000-4000-8000-000000000003'''

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

-- ---------------------------------------------------------------------------
-- 1. household_slugify — the filler strip (Q7)
-- ---------------------------------------------------------------------------
begin;
select pg_temp.expect_text(public.household_slugify('The Okonkwo family'), 'okonkwo',
  'a leading The and a trailing family both come off');
select pg_temp.expect_text(public.household_slugify('The Nakamuras'), 'nakamuras',
  'a leading The comes off on its own');
select pg_temp.expect_text(public.household_slugify('Priya & Dev Raman'), 'priya-dev-raman',
  'an ampersand household keeps both names');
select pg_temp.expect_text(public.household_slugify('Grandma Reid'), 'grandma-reid',
  'a name with no filler is untouched');
select pg_temp.expect_text(public.household_slugify('Old rugby lot'), 'old-rugby-lot',
  'a household that is not a family keeps its whole name');
select pg_temp.expect_text(public.household_slugify('The Ferreira Family'), 'ferreira',
  'the strip is case-insensitive');
select pg_temp.expect_text(public.household_slugify('The Reid whānau'), 'reid',
  'whanau strips like family, macron and all');
select pg_temp.expect_text(public.household_slugify('Theodore Blake'), 'theodore-blake',
  'a name merely STARTING with the letters "the" is not stripped');
select pg_temp.expect_text(public.household_slugify('Family Ferreira'), 'family-ferreira',
  'family is only stripped from the end');

-- The fallbacks, in order.
select pg_temp.expect_text(public.household_slugify('The family'), 'the-family',
  'stripping down to nothing falls back to the unstripped name');
select pg_temp.expect_text(public.household_slugify('🎉🎉'), 'household',
  'a name with nothing slugifiable falls back to the constant');
select pg_temp.expect_text(public.household_slugify(null), 'household',
  'null in, an address out — every household has one');
select pg_temp.expect_text(public.household_slug_base('J'), 'household',
  'a one-character name would fail the shape check, so it does not get used');
rollback;

-- ---------------------------------------------------------------------------
-- 2. household_slug_suffix — shape and independence
-- ---------------------------------------------------------------------------
begin;
select pg_temp.expect_true(
  public.household_slug_suffix() ~ '^[0-9abcdefghjkmnpqrstvwxyz]{5}$',
  'a suffix is five Crockford base32 characters');

select pg_temp.expect_true(
  not exists (
    select 1 from generate_series(1, 200) g
    where public.household_slug_suffix() ~ '[ilou]'
  ),
  'no i, l, o or u in 200 draws — 0/O cannot be misread down the phone');

-- Not a randomness test (that is not testable here); a "did somebody make it
-- constant" test. A seeded PRNG reused within one statement would show up.
select pg_temp.expect_true(
  (select count(distinct public.household_slug_suffix()) from generate_series(1, 50)) > 40,
  '50 draws are not the same value');
rollback;

-- ---------------------------------------------------------------------------
-- 3. The seed's households were backfilled, readably
-- ---------------------------------------------------------------------------
begin;
select pg_temp.expect_text(
  (select slug from public.households where display_name = 'The Okonkwo family'),
  'okonkwo',
  'the seed household reads okonkwo, not the-okonkwo-family');

select pg_temp.expect_true(
  (select count(*) from public.households where slug is null or slug_suffix is null) = 0,
  'every existing household came out of the backfill with an address');

select pg_temp.expect_true(
  (select count(distinct (wedding_id, slug, slug_suffix)) = count(*)
     from public.households where deleted_at is null),
  'the backfill produced no duplicate addresses');
rollback;

-- ---------------------------------------------------------------------------
-- 4. Insert derives an address — Q8, no household without a page
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

insert into public.households (wedding_id, display_name, rank)
values ('11111111-1111-4111-8111-111111111111', 'The Attenborough family', 'zz1');

select pg_temp.expect_text(
  (select slug from public.households where rank = 'zz1'),
  'attenborough',
  'a new household is given a readable slug with no help from the app');

select pg_temp.expect_true(
  (select slug_suffix ~ '^[0-9abcdefghjkmnpqrstvwxyz]{5}$'
     from public.households where rank = 'zz1'),
  'and a suffix');

-- A supplied suffix is honoured: this is what lets a reissue mint a fresh one.
insert into public.households (wedding_id, display_name, rank, slug, slug_suffix)
values ('11111111-1111-4111-8111-111111111111', 'Anything', 'zz2', 'chosen', 'abcde');
select pg_temp.expect_text(
  (select slug || '-' || slug_suffix from public.households where rank = 'zz2'),
  'chosen-abcde',
  'an explicitly supplied address is used as given');
rollback;

-- ---------------------------------------------------------------------------
-- 5. Two households of the same name get different addresses
-- ---------------------------------------------------------------------------
-- The readable half is allowed to collide. The pair is not, and the trigger
-- redraws rather than failing the insert.
begin;
set local role service_role;

insert into public.households (wedding_id, display_name, rank) values
  ('11111111-1111-4111-8111-111111111111', 'The Smith family', 'zy1'),
  ('11111111-1111-4111-8111-111111111111', 'The Smith family', 'zy2');

select pg_temp.expect_true(
  (select count(*) = 2 from public.households where slug = 'smith'
     and wedding_id = '11111111-1111-4111-8111-111111111111'),
  'both Smith households keep the readable name');

select pg_temp.expect_true(
  (select count(distinct slug_suffix) = 2 from public.households where slug = 'smith'
     and wedding_id = '11111111-1111-4111-8111-111111111111'),
  'and are told apart by the suffix, not by -2');

-- The same address twice is rejected outright.
do $$
begin
  begin
    insert into public.households (wedding_id, display_name, rank, slug, slug_suffix)
    values ('11111111-1111-4111-8111-111111111111', 'Impostor', 'zy3', 'smith',
            (select slug_suffix from public.households where slug = 'smith' limit 1));
    raise exception 'FAIL — two households were allowed the same address';
  exception
    when unique_violation then raise notice '  ok  the same address cannot be issued twice';
  end;
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 6. The shape checks
-- ---------------------------------------------------------------------------
-- A slug with a slash in it is a routing bug that only shows up in
-- production, so the database refuses it rather than trusting the form.
begin;
set local role service_role;

do $$
declare
  bad text;
begin
  foreach bad in array array['with/slash', 'with space', 'UPPER', '-leading', 'trailing-', 'a']
  loop
    begin
      update public.households set slug = bad
       where id = 'd0000000-0000-4000-8000-000000000001';
      raise exception 'FAIL — a household accepted the slug %', bad;
    exception
      when check_violation then raise notice '  ok  the slug % is rejected', bad;
    end;
  end loop;
end;
$$;

do $$
begin
  begin
    update public.households set slug_suffix = 'illou'
     where id = 'd0000000-0000-4000-8000-000000000001';
    raise exception 'FAIL — a suffix outside the alphabet was accepted';
  exception
    when check_violation then raise notice '  ok  a suffix outside the alphabet is rejected';
  end;
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 7. Neither half can be cleared by an update
-- ---------------------------------------------------------------------------
-- The trigger is BEFORE INSERT only (0015's rule): an update that clears the
-- address is a bug in the caller, and re-deriving one would hide it.
begin;
set local role service_role;

do $$
begin
  begin
    update public.households set slug = null
     where id = 'd0000000-0000-4000-8000-000000000001';
    raise exception 'FAIL — a household was allowed to lose its slug';
  exception
    when not_null_violation then raise notice '  ok  a slug cannot be cleared by an update';
  end;

  begin
    update public.households set slug_suffix = null
     where id = 'd0000000-0000-4000-8000-000000000001';
    raise exception 'FAIL — a household was allowed to lose its suffix';
  exception
    when not_null_violation then raise notice '  ok  a suffix cannot be cleared by an update';
  end;
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 8. A soft-deleted household does not squat its address
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

update public.households set deleted_at = now()
 where id = 'd0000000-0000-4000-8000-000000000001';

insert into public.households (wedding_id, display_name, rank, slug, slug_suffix)
select wedding_id, display_name, 'zx1', slug, slug_suffix
  from public.households
 where id = 'd0000000-0000-4000-8000-000000000001';

select pg_temp.expect_true(
  (select count(*) = 2 from public.households h
    where h.slug = 'okonkwo'),
  'a cut household keeps its row, and its address can be reissued');
rollback;

-- ---------------------------------------------------------------------------
-- 9. household_slug_aliases
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

insert into public.household_slug_aliases (wedding_id, household_id, slug, slug_suffix)
values ('11111111-1111-4111-8111-111111111111',
        'd0000000-0000-4000-8000-000000000001', 'the-okonkwos', 'q4h7m');

select pg_temp.expect_true(
  (select count(*) = 1 from public.household_slug_aliases
    where household_id = 'd0000000-0000-4000-8000-000000000001'),
  'a retired address can be recorded');

do $$
begin
  begin
    insert into public.household_slug_aliases (wedding_id, household_id, slug, slug_suffix)
    values ('11111111-1111-4111-8111-111111111111',
            'd0000000-0000-4000-8000-000000000002', 'the-okonkwos', 'q4h7m');
    raise exception 'FAIL — one retired address pointed at two households';
  exception
    when unique_violation then raise notice '  ok  a retired address belongs to one household';
  end;
end;
$$;

-- Deleting the household takes its aliases with it: a dangling redirect
-- target is worse than a 404.
delete from public.households where id = 'd0000000-0000-4000-8000-000000000001';
select pg_temp.expect_true(
  (select count(*) = 0 from public.household_slug_aliases
    where household_id = 'd0000000-0000-4000-8000-000000000001'),
  'aliases cascade with the household');
rollback;

-- ---------------------------------------------------------------------------
-- 10. RLS on the alias table, checked from another wedding's account
-- ---------------------------------------------------------------------------
-- The same second-account check every tenant table gets: the policy is only
-- worth anything if a collaborator on wedding two cannot read wedding one.
begin;
insert into public.household_slug_aliases (wedding_id, household_id, slug, slug_suffix)
select wedding_id, id, 'retired-name', 'z9x8w' from public.households
 where id = 'd0000000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub', :stranger, true);
set local role authenticated;

select pg_temp.expect_true(
  (select count(*) = 0 from public.household_slug_aliases),
  'the other wedding''s collaborator sees no aliases at all');
rollback;

-- ---------------------------------------------------------------------------
-- 11. v_households carries the address
-- ---------------------------------------------------------------------------
-- The household screen reads the view, not the table.
begin;
select pg_temp.expect_text(
  (select slug || '-' || slug_suffix from public.v_households
    where id = 'd0000000-0000-4000-8000-000000000001'),
  (select slug || '-' || slug_suffix from public.households
    where id = 'd0000000-0000-4000-8000-000000000001'),
  'v_households reports the same address as the table');
rollback;

-- ---------------------------------------------------------------------------
-- 12. events.guest_note
-- ---------------------------------------------------------------------------
-- The per-event, guest-facing note (Q3). The seed carries one per event so a
-- reset renders the "On the day" section; this checks the column behaves and
-- that an event without a note is a legitimate state rather than a null that
-- breaks the page.
begin;
select pg_temp.expect_true(
  (select count(*) = 3 from public.events
    where wedding_id = '11111111-1111-4111-8111-111111111111'
      and guest_note is not null),
  'the seed gives every event a guest-facing note');

set local role service_role;
update public.events set guest_note = null
 where id = 'e1111111-1111-4111-8111-111111111111';
select pg_temp.expect_true(
  (select guest_note is null from public.events
    where id = 'e1111111-1111-4111-8111-111111111111'),
  'an event with nothing to say can have no note at all');

update public.events set guest_note = 'Park on the street; the gates shut at 2.'
 where id = 'e1111111-1111-4111-8111-111111111111';
select pg_temp.expect_true(
  (select guest_note like 'Park on%' from public.events
    where id = 'e1111111-1111-4111-8111-111111111111'),
  'and one can be written back');
rollback;
