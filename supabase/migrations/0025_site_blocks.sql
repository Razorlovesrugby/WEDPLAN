-- ===========================================================================
-- 0025: the site becomes a list of blocks (spec 23 §4)
-- ===========================================================================
-- `site_content` said "a wedding has at most one Story": one row per
-- block_key, unique per wedding, twelve keys the app knows about. A builder
-- says "a page is a list of whatever you like, in whatever order, as many
-- times as you like". That is the whole change.
--
--   site_blocks     the DRAFT. What the planner is editing right now.
--   site_revisions  what guests are actually seeing — a snapshot, taken on
--                   publish.
--   song_requests   the one widget that needs a table of its own.
--
-- WHY A SNAPSHOT rather than a published flag per block: the public page
-- becomes one row read instead of a join and a sort; a half-finished edit
-- cannot leak by construction rather than by care; "what did it look like in
-- March" is answerable; and rollback is an insert rather than an undo. The
-- last twenty are kept (Q4), pruned by a trigger so nothing has to remember.
--
-- `site_content` IS LEFT IN PLACE and unread by the app. Migrations are
-- append-only, and dropping a table the moment its replacement lands is how a
-- rollback becomes a data loss. The one exception is the `theme` row, which
-- was never a section and stays exactly where it is — the theme is
-- configuration, not content, and `/site/theme` keeps writing it.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- site_blocks — the draft
-- ---------------------------------------------------------------------------
-- `type` is text, not an enum. Every new widget would otherwise need its own
-- migration before anybody could try it, and the set of block types is a fact
-- about the application (src/lib/site/blocks.ts) rather than about the data.
-- The shape check is only there to keep a routing-hostile value out; the app
-- validates against its own catalogue on every write.
create table public.site_blocks (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  type        text not null,
  payload     jsonb not null default '{}'::jsonb,
  -- The closed set of presentation choices (§7): width, background,
  -- alignment, image shape. Closed rather than free-form CSS, because a
  -- builder that can produce an unreadable page has failed at the job it was
  -- bought for.
  style       jsonb not null default '{}'::jsonb,
  sort_order  integer not null default 0,
  visible     boolean not null default true,
  audience    public.block_audience not null default 'everyone',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, wedding_id),
  check (type ~ '^[a-z][a-z0-9_]{1,40}$'),
  check (jsonb_typeof(payload) = 'object'),
  check (jsonb_typeof(style) = 'object')
);
create index site_blocks_wedding_idx on public.site_blocks (wedding_id, sort_order);
create trigger site_blocks_touch before update on public.site_blocks
  for each row execute function public.touch_updated_at();

comment on table public.site_blocks is
  'The site the planner is editing. Guests see site_revisions, never this (spec 23 §4).';

-- ---------------------------------------------------------------------------
-- site_revisions — what guests see
-- ---------------------------------------------------------------------------
-- `blocks` is the whole page, frozen: an array of objects in render order,
-- each carrying type, payload, style, visible and audience. Denormalised on
-- purpose — a revision has to keep rendering exactly as it did even after the
-- draft has moved on, and a foreign key to a row that has since changed would
-- give the opposite.
create table public.site_revisions (
  id            uuid primary key default gen_random_uuid(),
  wedding_id    uuid not null references public.weddings (id) on delete cascade,
  published_at  timestamptz not null default now(),
  published_by  uuid references auth.users (id) on delete set null,
  blocks        jsonb not null,
  note          text,
  check (jsonb_typeof(blocks) = 'array')
);
create index site_revisions_wedding_idx
  on public.site_revisions (wedding_id, published_at desc);

comment on table public.site_revisions is
  'Published snapshots of the site. The public page reads the newest; the last twenty are kept (spec 23 Q4).';

-- Keep the newest twenty per wedding. A trigger rather than a line in the
-- publish action: the pruning must happen however a revision arrives —
-- publish, restore, or a hand-written insert during a recovery.
create or replace function public.prune_site_revisions()
returns trigger
language plpgsql
as $$
begin
  -- Aliased `stale`, not `old`: inside a trigger function OLD is a reserved
  -- record variable, and using it as a table alias makes every reference to
  -- it ambiguous — which only shows up when the trigger actually fires.
  delete from public.site_revisions stale
  where stale.wedding_id = new.wedding_id
    and stale.id not in (
      select r.id
      from public.site_revisions r
      where r.wedding_id = new.wedding_id
      order by r.published_at desc, r.id desc
      limit 20
    );
  return null;
end;
$$;

create trigger site_revisions_prune
  after insert on public.site_revisions
  for each row execute function public.prune_site_revisions();

-- ---------------------------------------------------------------------------
-- song_requests (spec 23 §8, Q2)
-- ---------------------------------------------------------------------------
-- Open to anyone with the site address, which is a decision with a cost: a
-- form on a public URL is a form the internet can find. So the household and
-- guest are nullable (a request from a personalised page is attributed
-- automatically, one from the shared page is not), `asked_by` is an optional
-- name rather than an identity, and `status` exists so the planner's list is
-- a list they control. The rate limit lives in the application, on the same
-- counter the RSVP path uses.
--
-- Nothing a guest types here is rendered back onto the public page. The list
-- is planner-facing, and that is what keeps an open form from becoming a
-- billboard.
create table public.song_requests (
  id            uuid primary key default gen_random_uuid(),
  wedding_id    uuid not null references public.weddings (id) on delete cascade,
  household_id  uuid,
  guest_id      uuid,
  asked_by      text,
  title         text not null,
  artist        text,
  note          text,
  status        text not null default 'new',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (household_id, wedding_id)
    references public.households (id, wedding_id) on delete set null (household_id),
  foreign key (guest_id, wedding_id)
    references public.guests (id, wedding_id) on delete set null (guest_id),
  check (title <> ''),
  check (status in ('new', 'approved', 'played', 'ignored'))
);
create index song_requests_wedding_idx
  on public.song_requests (wedding_id, status, created_at desc);
create trigger song_requests_touch before update on public.song_requests
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- The backfill
-- ---------------------------------------------------------------------------
-- One site_content row becomes one site_blocks row of the same type, payload
-- and order. Nothing is lost and nothing is interpreted: the payload readers
-- in src/lib/site/sections.ts carry over unchanged, which is most of why this
-- migration is cheap.
--
-- `theme` is skipped — it is configuration, not a block, and /site/theme keeps
-- writing it where it is.
insert into public.site_blocks (wedding_id, type, payload, sort_order, visible)
select
  sc.wedding_id,
  sc.block_key,
  sc.payload,
  sc.sort_order,
  sc.visible
from public.site_content sc
where sc.block_key <> 'theme'
  and sc.block_key ~ '^[a-z][a-z0-9_]{1,40}$';

-- ---------------------------------------------------------------------------
-- The first revision
-- ---------------------------------------------------------------------------
-- WITHOUT THIS EVERY LIVE SITE GOES BLANK the moment the renderer starts
-- reading revisions, because a wedding that has never pressed Publish has no
-- revision. So each wedding gets one now, from exactly what it was already
-- serving, and `published_at` is backdated to the site's own last edit rather
-- than to the migration — "guests are seeing the version from 4 March" should
-- say something true.
insert into public.site_revisions (wedding_id, blocks, published_at, note)
select
  w.id,
  coalesce(
    (
      select jsonb_agg(
               jsonb_build_object(
                 'id', b.id,
                 'type', b.type,
                 'payload', b.payload,
                 'style', b.style,
                 'visible', b.visible,
                 'audience', b.audience
               )
               order by b.sort_order, b.created_at
             )
      from public.site_blocks b
      where b.wedding_id = w.id
    ),
    '[]'::jsonb
  ),
  coalesce(
    (select max(sc.updated_at) from public.site_content sc where sc.wedding_id = w.id),
    now()
  ),
  'Migrated from the section editor'
from public.weddings w;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- The usual shape (0002's rule). The public read path reaches revisions and
-- song requests through the service role, which bypasses RLS and scopes
-- itself by wedding — the same arrangement as every other public surface.
do $$
declare
  t text;
begin
  foreach t in array array['site_blocks', 'site_revisions', 'song_requests'] loop
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
