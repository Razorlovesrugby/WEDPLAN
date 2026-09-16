-- ===========================================================================
-- 0013: Moodboards
-- ===========================================================================
-- See docs/specs/09-moodboards.md. Titled grids of images that can be handed
-- to one audience over a link that needs no account -- the photographer for
-- the photo vibes, the guests for the dress code.
--
-- `0001`-`0012` are applied (or frozen pending application) and are not
-- edited. This file only adds.
--
-- WHAT IS DELIBERATELY NOT IN THIS FILE: anything touching `storage`.
-- The images live in a private Supabase Storage bucket, and every object in
-- it is written, signed and deleted by the service role from code that has
-- already established which wedding the caller collaborates on (spec 9
-- section 3). That means no policy on storage.objects -- which in turn means
-- scripts/verify-migrations.sh can keep applying this file to a bare
-- PostgreSQL cluster whose shim provides `auth` and nothing else. The bucket
-- itself is created by scripts/ensure-bucket.mjs, not by a migration.
-- ===========================================================================

-- link        an unguessable token at /m/{token}. Many per board.
-- public_site the board renders on /w.
-- rsvp        the board renders inside /rsvp/{token}, where the household's
--             invitation token has already done the authenticating.
create type moodboard_share_channel as enum ('link', 'public_site', 'rsvp');

-- ---------------------------------------------------------------------------
-- moodboards
-- ---------------------------------------------------------------------------
create table public.moodboards (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  title       text not null,
  description text,
  event_id    uuid,
  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (event_id, wedding_id)
    references public.events (id, wedding_id) on delete set null (event_id),
  check (title <> '')
);
create index moodboards_wedding_idx
  on public.moodboards (wedding_id, sort_order) where archived_at is null;
create trigger moodboards_touch before update on public.moodboards
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- moodboard_items
-- ---------------------------------------------------------------------------
-- `caption` is the public one and `note` is the private one -- two columns
-- rather than one plus a flag, so "is this safe to show a guest" is answered
-- by looking at which column it is in (spec 9 section 6).
--
-- `uploaded_at` null means the row exists but its bytes never arrived. Such a
-- row is invisible everywhere except the board page that created it, where it
-- renders as a failed tile with retry and remove. No sweeper: the only way to
-- make one is to close the tab mid-upload.
create table public.moodboard_items (
  id            uuid primary key default gen_random_uuid(),
  wedding_id    uuid not null references public.weddings (id) on delete cascade,
  moodboard_id  uuid not null,
  storage_path  text not null,
  thumb_path    text not null,
  content_type  text not null,
  byte_size     integer not null check (byte_size >= 0),
  width         integer check (width is null or width > 0),
  height        integer check (height is null or height > 0),
  uploaded_at   timestamptz,
  caption       text,
  note          text,
  source_url    text,
  credit        text,
  is_cover      boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (moodboard_id, wedding_id)
    references public.moodboards (id, wedding_id) on delete cascade
);
create index moodboard_items_board_idx
  on public.moodboard_items (moodboard_id, sort_order);
-- At most one cover per board, in the database rather than in the action,
-- because v_moodboards joins on it expecting one row -- two covers would
-- duplicate a board on /moodboards rather than fail loudly.
create unique index moodboard_items_one_cover_idx
  on public.moodboard_items (moodboard_id) where is_cover;
create trigger moodboard_items_touch before update on public.moodboard_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- moodboard_shares
-- ---------------------------------------------------------------------------
create table public.moodboard_shares (
  id              uuid primary key default gen_random_uuid(),
  wedding_id      uuid not null references public.weddings (id) on delete cascade,
  moodboard_id    uuid not null,
  channel         moodboard_share_channel not null default 'link',
  label           text,
  -- sha256(token + pepper). Never the token itself -- same rule invitations
  -- follow, so a dump of this table is not a list of live share links.
  token_hash      text unique,
  -- AES-GCM under a key derived from the same pepper, so the planner can
  -- re-copy a link without reissuing it.
  token_encrypted text,
  show_notes      boolean not null default false,
  show_credits    boolean not null default true,
  expires_at      timestamptz,
  revoked_at      timestamptz,
  view_count      integer not null default 0,
  last_viewed_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (moodboard_id, wedding_id)
    references public.moodboards (id, wedding_id) on delete cascade,
  -- A channel that needs no credential must not be storing one, and a
  -- channel that does must not be missing one.
  constraint moodboard_shares_token_matches_channel check (
    (channel = 'link' and token_hash is not null and token_encrypted is not null)
    or (channel <> 'link' and token_hash is null and token_encrypted is null)
  )
);
create index moodboard_shares_board_idx on public.moodboard_shares (moodboard_id);
-- One public-site share and one RSVP share per board. Link shares are
-- deliberately unlimited: one per recipient is the point.
create unique index moodboard_shares_one_per_channel_idx
  on public.moodboard_shares (moodboard_id, channel) where channel <> 'link';
create trigger moodboard_shares_touch before update on public.moodboard_shares
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tenant_tables constant text[] := array[
    'moodboards',
    'moodboard_items',
    'moodboard_shares'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy %1$I on public.%2$I for all to authenticated '
      'using (public.is_collaborator(wedding_id)) '
      'with check (public.is_collaborator(wedding_id))',
      t || '_collaborator', t
    );
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- v_moodboards
-- ---------------------------------------------------------------------------
-- What /moodboards needs in one row per board, so the list is one query
-- rather than N+1. security_invoker, so RLS on the base tables still decides
-- who sees what.
--
-- Columns are listed explicitly rather than `m.*` ON PURPOSE. `m.*` expands
-- at definition time, so a column added to moodboards later lands in the
-- MIDDLE of this view's column list -- and `create or replace view` may only
-- append. 0014 adds moodboards.layout and would have failed with "cannot
-- change name of view column". It did, once.
create view public.v_moodboards with (security_invoker = true) as
select
  m.id,
  m.wedding_id,
  m.title,
  m.description,
  m.event_id,
  m.sort_order,
  m.archived_at,
  m.created_at,
  m.updated_at,
  e.name as event_name,
  coalesce(i.item_count, 0)  as item_count,
  coalesce(i.total_bytes, 0) as total_bytes,
  cover.thumb_path           as cover_thumb_path,
  cover.width                as cover_width,
  cover.height               as cover_height,
  coalesce(s.link_share_count, 0)      as link_share_count,
  coalesce(s.published_to_site, false) as published_to_site,
  coalesce(s.published_to_rsvp, false) as published_to_rsvp,
  s.last_viewed_at
from public.moodboards m
left join public.events e
  on e.id = m.event_id and e.wedding_id = m.wedding_id
left join lateral (
  select count(*)::int as item_count, coalesce(sum(byte_size), 0)::bigint as total_bytes
  from public.moodboard_items mi
  where mi.moodboard_id = m.id and mi.uploaded_at is not null
) i on true
-- The flagged cover, else the first item by sort_order. A board with no
-- cover set still shows a picture on /moodboards.
left join lateral (
  select mi.thumb_path, mi.width, mi.height
  from public.moodboard_items mi
  where mi.moodboard_id = m.id and mi.uploaded_at is not null
  order by mi.is_cover desc, mi.sort_order, mi.created_at
  limit 1
) cover on true
left join lateral (
  select
    count(*) filter (
      where ms.channel = 'link'
        and ms.revoked_at is null
        and (ms.expires_at is null or ms.expires_at > now())
    )::int as link_share_count,
    bool_or(ms.channel = 'public_site' and ms.revoked_at is null) as published_to_site,
    bool_or(ms.channel = 'rsvp' and ms.revoked_at is null)        as published_to_rsvp,
    max(ms.last_viewed_at) as last_viewed_at
  from public.moodboard_shares ms
  where ms.moodboard_id = m.id
) s on true
where m.archived_at is null;

revoke all on public.v_moodboards from anon;
grant select on public.v_moodboards to authenticated;
