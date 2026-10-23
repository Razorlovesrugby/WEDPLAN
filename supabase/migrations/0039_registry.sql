-- ===========================================================================
-- 0039_registry.sql — a gift registry on a page of its own (spec 36)
--
-- Run AFTER 0038 has committed (it adds the `registry` photograph kind; see
-- that file for why they are two).
--
-- WHAT THIS IS: a list of things the couple would love, each a link out to a
-- shop; a public page at /registry/<wedding slug>; and a "claim" record so a
-- visitor can say "I'll buy this", leave a name and a message, and take the
-- item off the page.
--
-- WHAT THIS IS NOT: a payment integration. Nothing here takes money. The same
-- argument 0030 makes about gift funds applies word for word: an "I'll buy
-- this" is a promise, not a purchase, and the couple move it along themselves.
--
-- THE RULE THE WHOLE SHAPE TURNS ON: a visitor must never see another
-- visitor's name or message. So `registry_claims` is closed to `anon` and the
-- public page never queries it. What a visitor can learn about claims is one
-- derived number per item, `remaining`, from `v_registry_items` — computed in
-- ONE place so the page, the card and the planner's list cannot disagree.
--
-- GUESTS ARE NOT INVOLVED. Nothing here references `guests`, `households` or
-- `rsvps`. A person who is not invited uses the registry exactly as a guest
-- does, and a claim is free text, not a guest.
--
-- TENANCY: wedding_id on every table, composite foreign keys so a tag and an
-- item (or a claim and its item) can never belong to different weddings.
-- MONEY: integer minor units, NZD only (spec 18) — no currency column.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- registry_settings — one row per wedding
-- ---------------------------------------------------------------------------
create table public.registry_settings (
  wedding_id           uuid primary key references public.weddings (id) on delete cascade,
  -- Off until the couple turn it on: a half-built registry is not a page.
  enabled              boolean not null default false,
  -- Closed = the page stays up, claiming is off ("thank you for everything").
  open                 boolean not null default true,
  title                text,
  intro                text,
  hero_asset_id        uuid,
  thanks_text          text,
  thanks_asset_id      uuid,
  no_gifts_line        text,
  show_prices          boolean not null default true,
  -- Default off: a claimed item simply leaves, as the couple asked.
  show_taken           boolean not null default false,
  show_funds           boolean not null default false,
  disclosure_on        boolean not null default false,
  disclosure_text      text,
  -- The registry's own look (spec 36 Q7a). Closed lists live in the app
  -- (`src/lib/registry/look.ts`), not here: a new palette should not be a
  -- migration. The length check just keeps junk out.
  palette              text not null default 'linen',
  type_pairing         text not null default 'classic',
  -- The dashboard's "N new claims since you last looked".
  last_viewed_claims_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  foreign key (hero_asset_id, wedding_id)
    references public.site_assets (id, wedding_id) on delete set null (hero_asset_id),
  foreign key (thanks_asset_id, wedding_id)
    references public.site_assets (id, wedding_id) on delete set null (thanks_asset_id),
  check (title is null or char_length(title) <= 120),
  check (intro is null or char_length(intro) <= 600),
  check (thanks_text is null or char_length(thanks_text) <= 1500),
  check (no_gifts_line is null or char_length(no_gifts_line) <= 300),
  check (disclosure_text is null or char_length(disclosure_text) <= 300),
  check (char_length(palette) between 1 and 30),
  check (char_length(type_pairing) between 1 and 30)
);
create trigger registry_settings_touch before update on public.registry_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- registry_shipping — where the gifts go. One row per wedding.
--
-- A table of its own rather than columns on `weddings` or on the settings:
-- `getCurrentWedding()` reads `weddings.*` into the planner's pages, and a
-- home address has no business riding along in every one of those reads
-- (the 0033 precedent). The PUBLIC page never selects it either: it is shown
-- only to a visitor who has just claimed something.
-- ---------------------------------------------------------------------------
create table public.registry_shipping (
  wedding_id     uuid primary key references public.weddings (id) on delete cascade,
  recipient_name text,
  line1          text,
  line2          text,
  city           text,
  region         text,
  postcode       text,
  country        text not null default 'New Zealand',
  courier_note   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (recipient_name is null or char_length(recipient_name) <= 120),
  check (line1 is null or char_length(line1) <= 160),
  check (line2 is null or char_length(line2) <= 160),
  check (city is null or char_length(city) <= 100),
  check (region is null or char_length(region) <= 100),
  check (postcode is null or char_length(postcode) <= 20),
  check (char_length(country) between 1 and 100),
  check (courier_note is null or char_length(courier_note) <= 300)
);
create trigger registry_shipping_touch before update on public.registry_shipping
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- registry_items
-- ---------------------------------------------------------------------------
create table public.registry_items (
  id             uuid primary key default gen_random_uuid(),
  wedding_id     uuid not null references public.weddings (id) on delete cascade,
  title          text not null,
  -- Ends up in an href in front of every visitor, so the database says so
  -- too (the 0030 `contribute_url` argument): web schemes only.
  url            text not null,
  store          text,
  image_asset_id uuid,
  price_minor    integer,
  note           text,
  -- How many the couple want. 1 for nearly everything; 4 for the wine glasses.
  quantity       integer not null default 1,
  -- [{label, value}] — colour, size, model... set by the OWNER (Q14), shown on
  -- the card so the buyer buys the right one. Display only; tags are what filter.
  specs          jsonb not null default '[]'::jsonb,
  ship_note      text,
  starred        boolean not null default false,
  hidden         boolean not null default false,
  sort_order     integer not null default 0,
  -- Soft: a claim may point at the item, and what was claimed must stay readable.
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (image_asset_id, wedding_id)
    references public.site_assets (id, wedding_id) on delete set null (image_asset_id),
  check (char_length(title) between 1 and 160),
  check (url ~* '^https?://' and char_length(url) <= 2000),
  check (store is null or char_length(store) <= 100),
  check (price_minor is null or price_minor >= 0),
  check (note is null or char_length(note) <= 400),
  check (quantity between 1 and 99),
  check (jsonb_typeof(specs) = 'array' and jsonb_array_length(specs) <= 8),
  check (ship_note is null or char_length(ship_note) <= 300)
);
create index registry_items_wedding_idx
  on public.registry_items (wedding_id, sort_order) where deleted_at is null;
create trigger registry_items_touch before update on public.registry_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------
create table public.registry_tags (
  id         uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  name       text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, wedding_id),
  check (char_length(name) between 1 and 40)
);
create unique index registry_tags_name_idx on public.registry_tags (wedding_id, lower(name));

create table public.registry_item_tags (
  item_id    uuid not null,
  tag_id     uuid not null,
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  primary key (item_id, tag_id),
  foreign key (item_id, wedding_id)
    references public.registry_items (id, wedding_id) on delete cascade,
  foreign key (tag_id, wedding_id)
    references public.registry_tags (id, wedding_id) on delete cascade
);
create index registry_item_tags_tag_idx on public.registry_item_tags (tag_id);

-- ---------------------------------------------------------------------------
-- registry_claims — "I'll buy this"
--
-- `claim_token_hash` is sha256(token + pepper), like an invitation's: the
-- buyer holds the token (their private undo link) and the database holds only
-- a hash, so a read of this table cannot be turned into a way to release
-- somebody's claim. Name and message are free text, rendered escaped, and are
-- NEVER sent to any visitor but the one who wrote them.
--
-- RELEASE IS SOFT (`released_at`). Consistent with "no destructive writes",
-- and the couple can still see that somebody claimed and backed out.
-- ---------------------------------------------------------------------------
create table public.registry_claims (
  id               uuid primary key default gen_random_uuid(),
  wedding_id       uuid not null references public.weddings (id) on delete cascade,
  item_id          uuid not null,
  name             text not null,
  message          text,
  quantity         integer not null default 1,
  status           text not null default 'claimed',
  claim_token_hash text not null unique,
  released_at      timestamptz,
  bought_at        timestamptz,
  arrived_at       timestamptz,
  thanked_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (item_id, wedding_id)
    references public.registry_items (id, wedding_id) on delete cascade,
  check (char_length(btrim(name)) between 1 and 80),
  check (message is null or char_length(message) <= 500),
  check (quantity between 1 and 99),
  check (status in ('claimed', 'bought', 'arrived', 'thanked'))
);
create index registry_claims_item_idx on public.registry_claims (item_id) where released_at is null;
create index registry_claims_wedding_idx on public.registry_claims (wedding_id, created_at desc);
create trigger registry_claims_touch before update on public.registry_claims
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- v_registry_items — an item and how many are still wanted
--
-- `remaining` is the ONE definition: quantity wanted minus the quantity of
-- every claim that has not been released. The public page, the card's
-- "2 still wanted", the planner's list and the claim function all read this
-- number or repeat exactly this arithmetic. security_invoker, like every
-- derived view here: the planner's session sees its own wedding through RLS,
-- and the public page reads it through the service role, scoped by wedding.
-- ---------------------------------------------------------------------------
create view public.v_registry_items
with (security_invoker = true) as
select
  i.id, i.wedding_id, i.title, i.url, i.store, i.image_asset_id, i.price_minor,
  i.note, i.quantity, i.specs, i.ship_note, i.starred, i.hidden, i.sort_order,
  i.deleted_at, i.created_at, i.updated_at,
  greatest(i.quantity - coalesce(c.claimed, 0), 0)::integer as remaining,
  coalesce(c.claimed, 0)::integer as claimed_quantity
from public.registry_items i
left join lateral (
  select sum(rc.quantity)::integer as claimed
  from public.registry_claims rc
  where rc.item_id = i.id and rc.wedding_id = i.wedding_id and rc.released_at is null
) c on true;

-- ---------------------------------------------------------------------------
-- claim_registry_item — the only way a visitor's claim is written
--
-- Called by the public server action with the service role (a visitor has no
-- database identity). It locks the ITEM row first, so two people pressing the
-- button for the last one serialise: the second sees `remaining = 0` and is
-- told so, rather than both succeeding. Returns a status string the action
-- turns into words; never raises for an expected refusal.
--
--   ok           claimed; `claim_id` is set
--   unavailable  no such item here, or hidden/deleted, or the registry is off/closed
--   sold_out     fewer than p_quantity remain (`remaining` says how many do)
--   busy         the whole wedding has taken too many claims in ten minutes —
--                the cheap guard against a joker claiming everything. No IPs
--                are stored anywhere (invitation_views stores none), so this
--                cannot be per-visitor; the couple can release any claim.
-- ---------------------------------------------------------------------------
create or replace function public.claim_registry_item(
  p_wedding_id uuid,
  p_item_id    uuid,
  p_name       text,
  p_message    text,
  p_quantity   integer,
  p_token_hash text
) returns table (outcome text, claim_id uuid, remaining integer)
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_item     public.registry_items%rowtype;
  v_settings public.registry_settings%rowtype;
  v_claimed  integer;
  v_left     integer;
  v_recent   integer;
  v_id       uuid;
begin
  select * into v_settings from public.registry_settings where wedding_id = p_wedding_id;
  if not found or not v_settings.enabled or not v_settings.open then
    return query select 'unavailable'::text, null::uuid, 0;
    return;
  end if;

  -- FOR UPDATE: this is the lock the race turns on.
  select * into v_item from public.registry_items
   where id = p_item_id and wedding_id = p_wedding_id
   for update;
  if not found or v_item.deleted_at is not null or v_item.hidden then
    return query select 'unavailable'::text, null::uuid, 0;
    return;
  end if;

  select count(*) into v_recent from public.registry_claims
   where wedding_id = p_wedding_id and released_at is null
     and created_at > now() - interval '10 minutes';
  if v_recent >= 15 then
    return query select 'busy'::text, null::uuid, 0;
    return;
  end if;

  select coalesce(sum(quantity), 0) into v_claimed from public.registry_claims
   where item_id = p_item_id and wedding_id = p_wedding_id and released_at is null;
  v_left := greatest(v_item.quantity - v_claimed, 0);
  if p_quantity < 1 or v_left < p_quantity then
    return query select 'sold_out'::text, null::uuid, v_left;
    return;
  end if;

  insert into public.registry_claims (wedding_id, item_id, name, message, quantity, claim_token_hash)
  values (p_wedding_id, p_item_id, btrim(p_name), nullif(btrim(coalesce(p_message, '')), ''),
          p_quantity, p_token_hash)
  returning id into v_id;

  return query select 'ok'::text, v_id, v_left - p_quantity;
end;
$$;

-- ---------------------------------------------------------------------------
-- release_registry_claim — a buyer undoing their own claim, by token hash
--
-- Only while the couple have not marked it arrived or thanked: past that the
-- gift exists and "undo" would be a lie.
-- ---------------------------------------------------------------------------
create or replace function public.release_registry_claim(p_token_hash text)
returns boolean
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_rows integer;
begin
  update public.registry_claims
     set released_at = now()
   where claim_token_hash = p_token_hash
     and released_at is null
     and status in ('claimed', 'bought');
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.claim_registry_item(uuid, uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.claim_registry_item(uuid, uuid, text, text, integer, text) to service_role;
revoke all on function public.release_registry_claim(text) from public, anon, authenticated;
grant execute on function public.release_registry_claim(text) to service_role;

-- ---------------------------------------------------------------------------
-- RLS — every table joins the tenant set; `anon` has nothing
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tenant_tables constant text[] := array[
    'registry_settings', 'registry_shipping', 'registry_items',
    'registry_tags', 'registry_item_tags', 'registry_claims'
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
revoke all on public.v_registry_items from anon;

-- ---------------------------------------------------------------------------
-- Audit (spec 32). The claim's token hash is a credential: redacted.
-- ---------------------------------------------------------------------------
create trigger audit_row after insert or update or delete on public.registry_settings
  for each row execute function public.audit_row('wedding_id', '', '');
create trigger audit_row after insert or update or delete on public.registry_shipping
  for each row execute function public.audit_row('wedding_id', 'recipient_name,line1,line2,city,region,postcode,courier_note', '');
create trigger audit_row after insert or update or delete on public.registry_items
  for each row execute function public.audit_row('id', '', 'title');
create trigger audit_row after insert or update or delete on public.registry_tags
  for each row execute function public.audit_row('id', '', 'name');
create trigger audit_row after insert or update or delete on public.registry_item_tags
  for each row execute function public.audit_row('item_id,tag_id', '', '');
create trigger audit_row after insert or update or delete on public.registry_claims
  for each row execute function public.audit_row('id', 'claim_token_hash', 'name');
