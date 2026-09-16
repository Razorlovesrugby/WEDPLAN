-- ===========================================================================
-- 0014: Moodboards -- Pinterest import, and the right-click clipper
-- ===========================================================================
-- See docs/specs/09.1-pinterest-import-and-clipper.md. Two ways for an image
-- to arrive that are not "the planner picked a file": the Pinterest API v5,
-- and a Chrome extension posting to /api/clip.
--
-- 0013 is this file's only dependency. It only adds.
--
-- TWO THINGS DELIBERATELY ABSENT, both for the same reason 0013 keeps
-- storage.objects out: a Supabase-managed object that does not exist on the
-- bare PostgreSQL cluster scripts/verify-migrations.sh builds. The realtime
-- publication at the bottom of this file is therefore GUARDED; see its note.
-- ===========================================================================

-- upload     the planner picked a file
-- clip       the Chrome extension right-clicked it somewhere on the web
-- pinterest  imported from a board over the API
--
-- A column rather than an inference from source_url: it drives what the item
-- panel offers, and "where did all these come from" is a real question about
-- a board with 90 items in it.
create type moodboard_item_origin as enum ('upload', 'clip', 'pinterest');

-- Provisioned now, read by nothing in this pass (spec 9.1 section 6). A
-- freeform canvas mode later is then a screen and a save action rather than
-- a migration on a table that by then has content in it.
create type moodboard_layout as enum ('grid', 'canvas');

alter table public.moodboards
  add column layout moodboard_layout not null default 'grid';

alter table public.moodboard_items
  add column origin      moodboard_item_origin not null default 'upload',
  -- The Pinterest pin id. Null for everything else.
  add column external_id text,
  add column x           double precision,
  add column y           double precision,
  add column scale       double precision,
  add column z_index     integer;

-- The entire dedupe story for re-importing a board: a pin already present is
-- skipped, so import is idempotent and needs no run log and no diffing UI.
-- Partial, so the many nulls do not collide with each other.
create unique index moodboard_items_external_idx
  on public.moodboard_items (moodboard_id, external_id) where external_id is not null;

-- ---------------------------------------------------------------------------
-- pinterest_accounts
-- ---------------------------------------------------------------------------
-- Tokens here are ENCRYPTED, not hashed, because they have to be used rather
-- than merely compared -- the same requirement invitations had for recovering
-- a link, and the same AES-GCM helpers in src/lib/tokens.ts.
--
-- A v5 access token is short-lived and comes with a refresh token, which is
-- why this is a table and not an environment variable: a static env var works
-- for an afternoon and then stops with an error that looks like a bug.
create table public.pinterest_accounts (
  id                      uuid primary key default gen_random_uuid(),
  wedding_id              uuid not null references public.weddings (id) on delete cascade,
  external_user_id        text not null,
  username                text,
  access_token_encrypted  text not null,
  refresh_token_encrypted text,
  token_expires_at        timestamptz,
  scopes                  text[] not null default '{}',
  connected_by            uuid references auth.users (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  -- One connection per wedding. Pinterest's own access tiers make a second
  -- one unlikely to work anyway (spec 9.1 section 4).
  unique (wedding_id),
  unique (id, wedding_id)
);
create trigger pinterest_accounts_touch before update on public.pinterest_accounts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- moodboard_clip_tokens
-- ---------------------------------------------------------------------------
-- One per browser/device. Hashed at rest (compared, never used), so this
-- table is not a list of live credentials. The extension holds the raw token
-- in chrome.storage.local and sends it as a bearer header, which is the
-- pattern /api/cron/reminders already uses for CRON_SECRET.
create table public.moodboard_clip_tokens (
  id                   uuid primary key default gen_random_uuid(),
  wedding_id           uuid not null references public.weddings (id) on delete cascade,
  label                text not null,
  token_hash           text not null unique,
  token_encrypted      text not null,
  default_moodboard_id uuid,
  last_used_at         timestamptz,
  revoked_at           timestamptz,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (default_moodboard_id, wedding_id)
    references public.moodboards (id, wedding_id) on delete set null (default_moodboard_id),
  check (label <> '')
);
create index moodboard_clip_tokens_wedding_idx
  on public.moodboard_clip_tokens (wedding_id) where revoked_at is null;
create trigger moodboard_clip_tokens_touch before update on public.moodboard_clip_tokens
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tenant_tables constant text[] := array[
    'pinterest_accounts',
    'moodboard_clip_tokens'
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
-- v_moodboards, redefined
-- ---------------------------------------------------------------------------
-- Not edited in place -- 0013 stays frozen, same move and same reasoning as
-- 0011 made against 0010. Every column 0013 defined keeps its name, position
-- and type, and `layout` is appended at the very end, which is the only thing
-- `create or replace view` permits.
create or replace view public.v_moodboards with (security_invoker = true) as
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
  s.last_viewed_at,
  -- Appended LAST, not slotted in beside the other moodboards columns:
  -- `create or replace view` may only add columns at the end. Position here
  -- is a constraint of the statement, not a choice about readability.
  m.layout
from public.moodboards m
left join public.events e
  on e.id = m.event_id and e.wedding_id = m.wedding_id
left join lateral (
  select count(*)::int as item_count, coalesce(sum(byte_size), 0)::bigint as total_bytes
  from public.moodboard_items mi
  where mi.moodboard_id = m.id and mi.uploaded_at is not null
) i on true
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

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- /moodboards/[id] subscribes to inserts on this table so a clip from the
-- extension lands on an open board without a refresh. The event is a NUDGE,
-- not a data channel: the row is not renderable on its own, because the
-- bucket is private and signing a URL is a server capability. The page calls
-- router.refresh() and the server signs.
--
-- GUARDED, and this is the point: `supabase_realtime` is created by Supabase
-- and does not exist on the bare cluster scripts/verify-migrations.sh builds,
-- so an unguarded ALTER PUBLICATION here would fail every CI run. Same class
-- of problem as storage.objects in 0013, same shape of answer.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.moodboard_items;
  end if;
end;
$$;
