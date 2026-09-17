-- ===========================================================================
-- weddings.slug tests (spec 14 §11, migration 0015)
-- ===========================================================================
-- The slug ends up in a URL, so the things worth asserting are the ones that
-- only fail in production: a slug with a slash in it, two weddings racing for
-- the same one, and the seed's own rows coming out of the backfill readable.
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null

create or replace function pg_temp.expect_text(actual text, wanted text, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. slugify
-- ---------------------------------------------------------------------------
begin;
select pg_temp.expect_text(public.slugify('Alex & Sam'), 'alex-sam', 'ampersand becomes a separator');
select pg_temp.expect_text(public.slugify('  Alex   and   Sam  '), 'alex-and-sam', 'runs collapse, edges trimmed');
select pg_temp.expect_text(public.slugify('José & Siân'), 'jose-sian', 'accents transliterate');
select pg_temp.expect_text(public.slugify('Zoë'), 'zoe', 'diaeresis transliterates');
select pg_temp.expect_text(public.slugify('A/B'), 'a-b', 'a slash cannot survive into a URL');
select pg_temp.expect_text(public.slugify('Alex--Sam'), 'alex-sam', 'double separators collapse');
select pg_temp.expect_text(public.slugify('-Alex-'), 'alex', 'leading and trailing separators go');
select pg_temp.expect_text(public.slugify('2027'), '2027', 'digits survive');
select pg_temp.expect_text(public.slugify('!!!'), null, 'nothing usable returns null, not an empty string');
select pg_temp.expect_text(public.slugify(null), null, 'null in, null out');
rollback;

-- ---------------------------------------------------------------------------
-- 2. The seed's weddings were backfilled
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

do $$
declare
  missing integer;
begin
  select count(*) into missing from public.weddings where slug is null;
  if missing > 0 then
    raise exception 'FAIL — % wedding(s) left without a slug by the backfill', missing;
  end if;
  raise notice '  ok  every seeded wedding has a slug';
end;
$$;

select pg_temp.expect_text(
  (select slug from public.weddings where id = '11111111-1111-4111-8111-111111111111'),
  'alex-sam',
  'the seed''s first wedding backfilled from its name'
);
rollback;

-- ---------------------------------------------------------------------------
-- 3. The insert trigger derives a slug, and deduplicates
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

insert into public.weddings (id, name) values
  ('dddddddd-0000-4000-8000-000000000001', 'Robin & Charlie');
select pg_temp.expect_text(
  (select slug from public.weddings where id = 'dddddddd-0000-4000-8000-000000000001'),
  'robin-charlie',
  'a new wedding derives its slug from its name'
);

-- Same name again: the second must not collide with the first.
insert into public.weddings (id, name) values
  ('dddddddd-0000-4000-8000-000000000002', 'Robin & Charlie');
select pg_temp.expect_text(
  (select slug from public.weddings where id = 'dddddddd-0000-4000-8000-000000000002'),
  'robin-charlie-2',
  'a colliding name is deduplicated rather than rejected'
);

insert into public.weddings (id, name) values
  ('dddddddd-0000-4000-8000-000000000003', 'Robin & Charlie');
select pg_temp.expect_text(
  (select slug from public.weddings where id = 'dddddddd-0000-4000-8000-000000000003'),
  'robin-charlie-3',
  'and again, counting up'
);

-- A name with nothing sluggable in it still produces a usable address.
insert into public.weddings (id, name) values
  ('dddddddd-0000-4000-8000-000000000004', '!!!');
select pg_temp.expect_text(
  (select slug from public.weddings where id = 'dddddddd-0000-4000-8000-000000000004'),
  'wedding-dddddddd',
  'an unsluggable name falls back to the id'
);

-- An explicit slug is respected, not overwritten.
insert into public.weddings (id, name, slug) values
  ('dddddddd-0000-4000-8000-000000000005', 'Robin & Charlie', 'the-good-one');
select pg_temp.expect_text(
  (select slug from public.weddings where id = 'dddddddd-0000-4000-8000-000000000005'),
  'the-good-one',
  'an explicitly supplied slug is used as given'
);
rollback;

-- ---------------------------------------------------------------------------
-- 4. The shape check rejects what a URL cannot carry
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

do $$
declare
  bad text;
  bad_slugs text[] := array[
    'Alex-Sam',     -- uppercase
    'alex sam',     -- a space
    'alex/sam',     -- a path separator
    'alex_sam',     -- underscore is not in the grammar
    '-alex',        -- leading separator
    'alex-',        -- trailing separator
    'alex--sam',    -- doubled separator
    'a',            -- too short
    'alex.sam'      -- a dot
  ];
begin
  foreach bad in array bad_slugs loop
    begin
      insert into public.weddings (name, slug) values ('Test', bad);
      raise exception 'FAIL — the slug % was accepted', bad;
    exception
      when check_violation then null;   -- expected
    end;
  end loop;
  raise notice '  ok  % malformed slugs rejected', array_length(bad_slugs, 1);
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 5. Slugs are unique across weddings
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

insert into public.weddings (name, slug) values ('One', 'taken-address');

do $$
begin
  begin
    insert into public.weddings (name, slug) values ('Two', 'taken-address');
    raise exception 'FAIL — two weddings were allowed the same slug';
  exception
    when unique_violation then raise notice '  ok  a slug belongs to one wedding';
  end;
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 6. Nulling a slug on update is rejected, not silently re-derived
-- ---------------------------------------------------------------------------
-- The trigger is BEFORE INSERT only, on purpose: an update that clears the
-- slug is a bug in the caller, and re-deriving one would hide it.
begin;
set local role service_role;

do $$
begin
  begin
    update public.weddings set slug = null
     where id = '11111111-1111-4111-8111-111111111111';
    raise exception 'FAIL — a wedding was allowed to lose its slug';
  exception
    when not_null_violation then raise notice '  ok  a slug cannot be cleared by an update';
  end;
end;
$$;
rollback;
