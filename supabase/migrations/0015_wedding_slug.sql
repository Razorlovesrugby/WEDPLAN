-- ===========================================================================
-- 0015: weddings.slug — the public site gets an address (spec 14 §11, Q9)
-- ===========================================================================
-- `src/app/w/page.tsx` currently opens with:
--
--   -- No session here, so the service role reads. V1 is one wedding, so this
--   -- takes the first; when there are several this needs a domain or a slug.
--
-- This is the slug. `/w` becomes `/w/[slug]`, and the "first wedding by
-- created_at" behaviour — which silently serves the wrong couple the moment a
-- second wedding exists — goes away.
--
-- Deliberately its own migration, ahead of the rest of spec 14's schema
-- (`0016_public_site.sql`). The slug is needed by build step 1, the renderer;
-- everything else in that spec is needed by step 4. Folding one column into a
-- migration three steps later would mean writing the public routing twice.
--
-- Q9 answered "slug, not custom domain", so there is no `wedding_domains`
-- table here and no hostname routing. If that changes, it is additive.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- slugify
-- ---------------------------------------------------------------------------
-- Used by the backfill below and by nothing else at runtime — the app sends a
-- slug it has already validated. It exists as a function anyway so the
-- backfill is readable and so a future migration can reuse it.
--
-- `unaccent` is NOT used: it is an extension, it would have to be enabled on
-- the live project, and `verify-migrations.sh` builds a bare cluster that may
-- not carry it. Transliteration of the Latin-1 range covers the names this
-- will actually meet (José, Siân, Zoë) and anything outside it falls through
-- to the id-based fallback rather than failing.
create or replace function public.slugify(p_input text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(both '-' from
      regexp_replace(
        regexp_replace(
          lower(translate(
            coalesce(p_input, ''),
            'àáâãäåāăąçćĉċčðďđèéêëēĕėęěĝğġģĥħìíîïĩīĭįıĵķĺļľŀłñńņňŉòóôõöøōŏőŕŗřśŝşšţťŧùúûüũūŭůűųŵýÿŷźżžæœßñ',
            'aaaaaaaaacccccdddeeeeeeeeegggghhiiiiiiiiijklllllnnnnnoooooooooRrrsssstttuuuuuuuuuuwyyyzzzaosn'
          )),
          '[^a-z0-9]+', '-', 'g'          -- anything else becomes a separator
        ),
        '-{2,}', '-', 'g'                 -- collapse runs
      )
    ),
    ''
  );
$$;

comment on function public.slugify(text) is
  'Lowercase URL-safe slug. Used by 0015''s backfill; the app validates its own.';

-- ---------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------
-- Nullable first, so the backfill has somewhere to write. Made NOT NULL at the
-- bottom of this file once every row has a value — a migration that adds a NOT
-- NULL column to a table with rows in it fails, and this table always has one.
alter table public.weddings
  add column if not exists slug text;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
-- From `name`, falling back to the first eight characters of the id for a
-- wedding whose name slugifies to nothing at all (an all-emoji name, a name in
-- a script the translate() above does not cover). Uniqueness is resolved by
-- appending -2, -3 … in created_at order, so the oldest wedding keeps the bare
-- slug and nothing depends on the order rows happen to come back in.
with candidate as (
  select
    id,
    coalesce(public.slugify(name), 'wedding-' || left(id::text, 8)) as base,
    row_number() over (
      partition by coalesce(public.slugify(name), 'wedding-' || left(id::text, 8))
      order by created_at, id
    ) as n
  from public.weddings
  where slug is null
)
update public.weddings w
   set slug = case when c.n = 1 then c.base else c.base || '-' || c.n end
  from candidate c
 where w.id = c.id;

-- ---------------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------------
-- The shape a slug is allowed to take, enforced in the database rather than
-- only in the form: this column ends up in a URL, and a slug with a slash or a
-- space in it is a routing bug that only shows up in production.
alter table public.weddings
  drop constraint if exists weddings_slug_shape;
alter table public.weddings
  add constraint weddings_slug_shape
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 64);

-- Case-insensitivity is already implied by the shape check (no uppercase can
-- be stored), so a plain unique index is enough and reads better in EXPLAIN
-- than a lower() expression index that can never differ from the column.
create unique index if not exists weddings_slug_key on public.weddings (slug);

alter table public.weddings
  alter column slug set not null;

comment on column public.weddings.slug is
  'Public site address: /w/<slug>. Unique, lowercase, URL-safe (spec 14 §11).';

-- ---------------------------------------------------------------------------
-- Defaulting the slug on insert
-- ---------------------------------------------------------------------------
-- Without this, a NOT NULL unique column with no default breaks every existing
-- path that creates a wedding — `bootstrap.sql`, which the planner runs by
-- hand against a live project, and `seed.sql`, which every local reset runs.
-- Making them each invent a unique slug is how one of them ends up with a
-- duplicate and the failure surfaces as a constraint violation during setup.
--
-- So: supply a slug and it is used as given (the app's rename path does this,
-- and the shape check still applies). Leave it null and one is derived from
-- the name, deduplicated in the same -2, -3 … form the backfill above uses.
--
-- Deliberately BEFORE INSERT only. An UPDATE that nulls the slug is a bug, and
-- silently re-deriving one would hide it; NOT NULL rejects it instead.
create or replace function public.weddings_default_slug()
returns trigger
language plpgsql
as $$
declare
  base text;
  candidate text;
  n integer := 1;
begin
  if new.slug is not null then
    return new;
  end if;

  base := coalesce(public.slugify(new.name), 'wedding-' || left(new.id::text, 8));
  candidate := base;

  -- Bounded: a wedding whose name collides 999 times is not a real wedding,
  -- and an unbounded loop here would hang an insert rather than fail it.
  while exists (select 1 from public.weddings w where w.slug = candidate) loop
    n := n + 1;
    if n > 999 then
      raise exception 'could not derive a unique slug from %', new.name;
    end if;
    candidate := base || '-' || n;
  end loop;

  new.slug := candidate;
  return new;
end;
$$;

drop trigger if exists weddings_default_slug on public.weddings;
create trigger weddings_default_slug
  before insert on public.weddings
  for each row execute function public.weddings_default_slug();
