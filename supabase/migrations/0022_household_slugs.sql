-- ===========================================================================
-- 0022: a readable address per household (spec 21)
-- ===========================================================================
-- Spec 14 gave the wedding an address (`0015`, /w/<slug>). This gives every
-- household one underneath it:
--
--   /w/ray-and-olivia/okonkwo-4f7ak
--
-- Two columns, because the two halves do different jobs and only one of them
-- is editable:
--
--   slug        the readable part, derived from households.display_name with
--               the filler stripped ("The Okonkwo family" -> "okonkwo").
--               Editable by the planner, live, at any time.
--
--   slug_suffix five random characters. This is the CREDENTIAL. It is what
--               stops /w/ray-and-olivia/smith being reachable by anyone who
--               can guess a surname — and behind that address sit guest
--               names, dietary notes, an RSVP form that can decline on a
--               family's behalf, coach seats and photo uploads (spec 21 §3).
--               Minted once, never changed by an edit, and NOT aliased
--               forward when an invitation is reissued.
--
-- Spec 21 Q1 chose this over a bare readable slug precisely so that spec 14
-- Q1's decision — one unguessable credential per household, no accounts —
-- survives the cosmetic change. Anyone proposing to drop the suffix later
-- should read §3 of the spec first; the list of what is behind the URL is
-- the whole argument.
--
-- Also here, because it is one migration's worth of work and all of it is
-- spec 21: `household_slug_aliases` (Q4 — an edited slug must not break the
-- link already sitting in someone's WhatsApp) and `events.guest_note` (Q3 —
-- the per-event, guest-facing note that the personalised page stitches
-- together from the events a household is actually invited to).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- household_slugify
-- ---------------------------------------------------------------------------
-- slugify() (0015) with the filler stripped first, per Q7:
--
--   The Okonkwo family  -> okonkwo
--   The Nakamuras       -> nakamuras
--   Priya & Dev Raman   -> priya-dev-raman
--   Grandma Reid        -> grandma-reid
--   Old rugby lot       -> old-rugby-lot
--
-- Never returns null, unlike slugify(): a household whose name is all emoji
-- still needs an address, and the suffix is what makes it unique anyway. Two
-- fallbacks, in order — the unstripped name (so a household literally called
-- "The Family" keeps something readable rather than losing its whole name to
-- the strip), then the constant 'household'.
--
-- The length floor is the shape check's, not an aesthetic: a household called
-- "J" would otherwise derive a one-character slug that the constraint below
-- rejects, and an insert that fails on a name the planner is allowed to type
-- is a bug.
create or replace function public.household_slugify(p_input text)
returns text
language sql
immutable
as $$
  with stripped as (
    select regexp_replace(
             regexp_replace(coalesce(p_input, ''), '^\s*the\s+', '', 'i'),
             '\s*(family|household|wh[āa]nau)\s*$', '', 'i'
           ) as value
  )
  select coalesce(
    nullif(left(public.slugify((select value from stripped)), 64), ''),
    nullif(left(public.slugify(p_input), 64), ''),
    'household'
  );
$$;

comment on function public.household_slugify(text) is
  'The readable half of a household address: slugify() with a leading "The" and a trailing "family" removed (spec 21 Q7). Never null.';

-- A one-character name survives the coalesce above but not the shape check,
-- so the floor is applied on top rather than inside — keeping the function
-- above readable as "what the slug says" and this as "what the column allows".
create or replace function public.household_slug_base(p_input text)
returns text
language sql
immutable
as $$
  select case
    when length(public.household_slugify(p_input)) >= 2
      then public.household_slugify(p_input)
    else 'household'
  end;
$$;

-- ---------------------------------------------------------------------------
-- household_slug_suffix
-- ---------------------------------------------------------------------------
-- Five characters of Crockford base32 — no i, l, o or u, so no 0/O confusion
-- when someone reads a link down the phone and far fewer accidental words.
--
-- Randomness matters here: this is the credential. gen_random_uuid() is
-- built into PostgreSQL 13+ (no pgcrypto extension to enable on the live
-- project, and none to miss in verify-migrations.sh's bare cluster) and draws
-- from the server's strong RNG. random() would NOT do: it is a seeded PRNG
-- whose stream is predictable from other values drawn in the same session.
--
-- Two hex characters per output character: 256 possible values, 32 symbols,
-- 256 mod 32 = 0, so the modulo introduces no bias.
create or replace function public.household_slug_suffix()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := '0123456789abcdefghjkmnpqrstvwxyz';
  hex text := replace(gen_random_uuid()::text, '-', '');
  result text := '';
  i integer;
begin
  for i in 0..4 loop
    result := result || substr(
      alphabet,
      (('x' || substr(hex, i * 2 + 1, 2))::bit(8)::integer % 32) + 1,
      1
    );
  end loop;
  return result;
end;
$$;

comment on function public.household_slug_suffix() is
  'Five Crockford base32 characters from the strong RNG. The unguessable half of a household address (spec 21 §3).';

-- ---------------------------------------------------------------------------
-- The columns
-- ---------------------------------------------------------------------------
-- Nullable first so the backfill has somewhere to write; NOT NULL at the
-- bottom, once every row has a value. Same shape as 0015 for the same reason:
-- this table always has rows in it.
alter table public.households add column if not exists slug text;
alter table public.households add column if not exists slug_suffix text;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
-- Row by row rather than one UPDATE, because each row needs its own draw from
-- household_slug_suffix() and a re-draw if it collides. A set-based update
-- would have to assume no collision, which is the sort of assumption that
-- holds until the day it does not.
--
-- Soft-deleted households are backfilled too: they keep their row (the guest
-- data rule), the resolver refuses to serve them, and an uncut household
-- should come back at the address it had rather than at a new one.
do $$
declare
  h record;
  candidate text;
  attempts integer;
begin
  for h in
    select id, wedding_id, display_name
    from public.households
    where slug is null or slug_suffix is null
    order by created_at, id
  loop
    attempts := 0;
    loop
      candidate := public.household_slug_suffix();
      exit when not exists (
        select 1
        from public.households other
        where other.wedding_id = h.wedding_id
          and other.slug = public.household_slug_base(h.display_name)
          and other.slug_suffix = candidate
      );
      attempts := attempts + 1;
      if attempts > 50 then
        raise exception 'could not draw a free slug suffix for household %', h.id;
      end if;
    end loop;

    update public.households
       set slug = public.household_slug_base(display_name),
           slug_suffix = candidate
     where id = h.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------------
-- The shape a slug is allowed to take, in the database rather than only in
-- the form — this column ends up in a URL, and a slug with a slash or a space
-- in it is a routing bug that only shows up in production (0015's reasoning,
-- unchanged).
alter table public.households drop constraint if exists households_slug_shape;
alter table public.households
  add constraint households_slug_shape
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 64);

alter table public.households drop constraint if exists households_slug_suffix_shape;
alter table public.households
  add constraint households_slug_suffix_shape
  check (slug_suffix ~ '^[0-9abcdefghjkmnpqrstvwxyz]{5}$');

-- Uniqueness is on the PAIR, not on the readable half: two Smith households
-- are smith-4f7ak and smith-9k2pm, and 0015's -2/-3 disambiguation is not
-- needed here because the suffix already does that job.
--
-- Partial, matching households_rank_key: a soft-deleted household must not
-- squat its own name forever, so an uncut-then-recut household can be given
-- the same address back.
create unique index if not exists households_address_key
  on public.households (wedding_id, slug, slug_suffix)
  where deleted_at is null;

alter table public.households alter column slug set not null;
alter table public.households alter column slug_suffix set not null;

comment on column public.households.slug is
  'Readable half of /w/<wedding>/<slug>-<suffix>. Editable; a retired value goes to household_slug_aliases (spec 21 §4).';
comment on column public.households.slug_suffix is
  'Unguessable half of the address. Minted once, never changed by an edit, never aliased forward on reissue (spec 21 §3).';

-- ---------------------------------------------------------------------------
-- Defaulting on insert
-- ---------------------------------------------------------------------------
-- Q8: every household has an address from the moment it exists. There is no
-- "create their page" button and no household-without-a-page state for every
-- screen, sender and export to handle.
--
-- BEFORE INSERT only, like 0015's: an UPDATE that nulls either column is a
-- bug in the caller, and silently re-deriving would hide it. NOT NULL rejects
-- it instead.
create or replace function public.households_default_slug()
returns trigger
language plpgsql
as $$
declare
  attempts integer := 0;
begin
  if new.slug is null then
    new.slug := public.household_slug_base(new.display_name);
  end if;

  -- A supplied address is used exactly as given, and a supplied one that
  -- collides is rejected by the unique index rather than quietly changed.
  -- The redraw below applies only to a suffix this trigger drew itself:
  -- silently handing back a different address than the caller asked for is
  -- how an invitation ends up pointing somewhere nobody sent.
  if new.slug_suffix is not null then
    return new;
  end if;

  new.slug_suffix := public.household_slug_suffix();

  while exists (
    select 1
    from public.households h
    where h.wedding_id = new.wedding_id
      and h.slug = new.slug
      and h.slug_suffix = new.slug_suffix
      and h.deleted_at is null
      and h.id <> new.id
  ) loop
    attempts := attempts + 1;
    if attempts > 50 then
      raise exception 'could not draw a free slug suffix for %', new.display_name;
    end if;
    new.slug_suffix := public.household_slug_suffix();
  end loop;

  return new;
end;
$$;

drop trigger if exists households_default_slug on public.households;
create trigger households_default_slug
  before insert on public.households
  for each row execute function public.households_default_slug();

-- ---------------------------------------------------------------------------
-- household_slug_aliases — Q4
-- ---------------------------------------------------------------------------
-- Every address a household has ever had, so editing one does not break the
-- link that went out in March. Without this, "editable" is only true before
-- anybody has the link, which is the opposite of what the feature is for.
--
-- The suffix is stored alongside the slug because an alias is a whole
-- address: a retired readable half is only ever valid with the suffix it was
-- retired with.
--
-- What deliberately does NOT write a row here is reissueInvitation. That
-- exists for "this link leaked", and forwarding the leaked address to the new
-- one would defeat the entire point of reissuing.
create table public.household_slug_aliases (
  wedding_id    uuid not null,
  household_id  uuid not null,
  slug          text not null,
  slug_suffix   text not null,
  retired_at    timestamptz not null default now(),
  primary key (wedding_id, slug, slug_suffix),
  foreign key (household_id, wedding_id)
    references public.households (id, wedding_id) on delete cascade,
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 64),
  check (slug_suffix ~ '^[0-9abcdefghjkmnpqrstvwxyz]{5}$')
);
create index household_slug_aliases_household_idx
  on public.household_slug_aliases (household_id);

comment on table public.household_slug_aliases is
  'Retired household addresses. Resolution tries live households first, then these, and redirects (spec 21 §4).';

-- ---------------------------------------------------------------------------
-- events.guest_note — Q3
-- ---------------------------------------------------------------------------
-- The guest-facing note for one event, stitched into a household's own page
-- for the events they are invited to — so a ceremony-only household reads the
-- ceremony's note and never learns there was one about Sunday breakfast.
--
-- NOT the run sheet. run_sheet_items carries vendor calls, supplier phone
-- numbers and internal timings for the couple and their helpers; this is the
-- couple talking to a guest. Different audience, different table, no shared
-- rows — written down because "we already have a run sheet" is the obvious
-- thing to reach for and reaching for it would publish a florist's mobile.
alter table public.events add column if not exists guest_note text;

comment on column public.events.guest_note is
  'Guest-facing note for this event, shown on the personalised page to households invited to it (spec 21 §5.4).';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Same shape as every other tenant table (0002's rule): keyed to wedding_id,
-- collaborators only, anon revoked. The public read path reaches aliases
-- through the service role, which bypasses RLS and scopes itself — the same
-- arrangement as every other public surface in this app.
alter table public.household_slug_aliases enable row level security;
alter table public.household_slug_aliases force row level security;

create policy household_slug_aliases_collaborator on public.household_slug_aliases
  for all to authenticated
  using (public.is_collaborator(wedding_id))
  with check (public.is_collaborator(wedding_id));

revoke all on public.household_slug_aliases from anon;

-- ---------------------------------------------------------------------------
-- v_households gains the address
-- ---------------------------------------------------------------------------
-- Appended at the end of the column list: CREATE OR REPLACE VIEW may only add
-- columns after the existing ones (0014's lesson). The household screen reads
-- this view rather than the table, so without these two columns it cannot
-- show the address it is now responsible for.
create or replace view public.v_households
with (security_invoker = true) as
select
  h.id,
  h.wedding_id,
  h.display_name,
  h.address,
  h.rank,
  h.reminders_muted,
  h.notes,
  h.created_at,
  h.updated_at,
  c.head_count,
  c.adult_count,
  c.child_count,
  c.infant_count,
  c.seat_count,
  sum(c.seat_count) over (
    partition by h.wedding_id
    order by h.rank
    rows between unbounded preceding and current row
  ) as seats_cumulative,
  t.label as tier,
  t.position as tier_position,
  h.slug,
  h.slug_suffix
from public.households h
cross join lateral (
  select
    count(*)::int                                                      as head_count,
    count(*) filter (where g.age_band = 'adult')::int                  as adult_count,
    count(*) filter (where g.age_band = 'child')::int                  as child_count,
    count(*) filter (where g.age_band = 'infant')::int                 as infant_count,
    count(*) filter (where g.age_band in ('adult', 'child'))::int      as seat_count
  from public.guests g
  where g.household_id = h.id
    and g.deleted_at is null
) c
cross join lateral (
  select cl.label, cl.position
  from public.cut_lines cl
  where cl.wedding_id = h.wedding_id
    and (cl.boundary_rank is null or h.rank <= cl.boundary_rank)
  order by cl.position
  limit 1
) t
where h.deleted_at is null;
