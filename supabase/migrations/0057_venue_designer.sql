-- 0057_venue_designer.sql  (spec 57 §15)
--
-- What the designer stores beyond layouts and spaces: table styles, the
-- couple's own décor and marquees, final item counts, share links, the
-- service style and menu, and the columns tables, fixtures and seats gain.
-- Then the state functions are rebuilt (version 2) so undo, History and
-- restore carry all of it.
--
-- Uses the enum values 0055 added. Not edited: 0036, 0053, 0056.

-- ---------------------------------------------------------------------------
-- 1. Wedding-wide things the couple defines
-- ---------------------------------------------------------------------------
create table public.seating_table_styles (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null,
  name        text not null check (name <> '' and length(name) <= 60),
  -- What is on each place and in the centre. Shaped by src/lib/seating/items.ts.
  place       jsonb not null default '{}'::jsonb check (jsonb_typeof(place) = 'object' and pg_column_size(place) <= 16384),
  centre      jsonb not null default '{}'::jsonb check (jsonb_typeof(centre) = 'object' and pg_column_size(centre) <= 16384),
  colour      text check (colour is null or colour ~ '^#[0-9a-fA-F]{6}$'),
  -- Soft-deleted: a style in an old version still resolves.
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, wedding_id)
);
create unique index seating_table_styles_name_uq
  on public.seating_table_styles (wedding_id, lower(name)) where deleted_at is null;
create trigger seating_table_styles_touch before update on public.seating_table_styles
  for each row execute function public.touch_updated_at();

create table public.seating_custom_items (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null,
  name        text not null check (name <> '' and length(name) <= 60),
  shape       text not null default 'rect' check (shape in ('rect', 'round')),
  width_cm    integer not null default 100 check (width_cm between 10 and 5000),
  depth_cm    integer not null default 100 check (depth_cm between 10 and 5000),
  colour      text check (colour is null or colour ~ '^#[0-9a-fA-F]{6}$'),
  vendor_id   uuid,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (vendor_id, wedding_id) references public.vendors (id, wedding_id) on delete set null (vendor_id)
);
create trigger seating_custom_items_touch before update on public.seating_custom_items
  for each row execute function public.touch_updated_at();

create table public.seating_marquees (
  id               uuid primary key default gen_random_uuid(),
  wedding_id       uuid not null,
  name             text not null check (name <> '' and length(name) <= 60),
  width_cm         integer not null check (width_cm between 100 and 20000),
  length_cm        integer not null check (length_cm between 100 and 20000),
  -- Poles along the sides, every this many cm. Null = none drawn.
  pole_spacing_cm  integer check (pole_spacing_cm is null or pole_spacing_cm between 50 and 5000),
  middle_poles     boolean not null default false,
  rounded_ends     boolean not null default false,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, wedding_id)
);
create trigger seating_marquees_touch before update on public.seating_marquees
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Final counts, per layout and item
-- ---------------------------------------------------------------------------
-- The number the couple types for an item ("32 glasses"); the app suggests,
-- the couple decides. item_key names the thing counted: `style:<style>:<item>`,
-- `fixture:<kind or custom id>`, `utensil`. A row can also name the supplier
-- and a budget line, which then follows final_count (the action does both
-- writes and checks both).
create table public.seating_item_counts (
  wedding_id      uuid not null,
  layout_id       uuid not null,
  item_key        text not null check (item_key <> '' and length(item_key) <= 160),
  final_count     integer check (final_count is null or final_count between 0 and 100000),
  -- What the app suggested (by chairs, by seated guests) when the number was
  -- typed, so the list can say "Seating changed since you set this".
  suggested_chairs integer check (suggested_chairs is null or suggested_chairs >= 0),
  suggested_guests integer check (suggested_guests is null or suggested_guests >= 0),
  vendor_id       uuid,
  budget_item_id  uuid,
  updated_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (layout_id, item_key),
  foreign key (layout_id, wedding_id) references public.seating_layouts (id, wedding_id) on delete cascade,
  foreign key (vendor_id, wedding_id) references public.vendors (id, wedding_id) on delete set null (vendor_id),
  foreign key (budget_item_id, wedding_id) references public.budget_items (id, wedding_id) on delete set null (budget_item_id)
);
create trigger seating_item_counts_touch before update on public.seating_item_counts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Share links (the function that reads through one comes with the page)
-- ---------------------------------------------------------------------------
create table public.seating_share_links (
  id            uuid primary key default gen_random_uuid(),
  wedding_id    uuid not null,
  event_id      uuid not null,
  -- sha-256 of the token; the token itself is shown once and never stored.
  token_hash    text not null unique,
  passcode_hash text,
  label         text check (label is null or length(label) <= 80),
  expires_at    timestamptz,
  revoked_at    timestamptz,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (event_id, wedding_id) references public.events (id, wedding_id) on delete cascade
);
create index seating_share_links_event_idx on public.seating_share_links (wedding_id, event_id);

-- ---------------------------------------------------------------------------
-- 4. Columns on the seating tables
-- ---------------------------------------------------------------------------
alter table public.seating_plans
  add column colour_by     text check (colour_by is null or length(colour_by) <= 80),
  add column service_style text not null default 'plated'
                             check (service_style in ('plated', 'shared', 'buffet', 'roaming')),
  add column menu          jsonb not null default '[]'::jsonb
                             check (jsonb_typeof(menu) = 'array' and pg_column_size(menu) <= 65536),
  add column settings      jsonb not null default '{}'::jsonb
                             check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 16384);

alter table public.seating_tables
  add column rows_count      integer check (rows_count between 1 and 100),
  add column aisle_cm        integer check (aisle_cm between 0 and 1000),
  add column segments        jsonb check (segments is null or (jsonb_typeof(segments) = 'array' and pg_column_size(segments) <= 8192)),
  add column style_id        uuid,
  add column style_changes   jsonb check (style_changes is null or (jsonb_typeof(style_changes) = 'object' and pg_column_size(style_changes) <= 16384)),
  add column platter_counts  jsonb check (platter_counts is null or (jsonb_typeof(platter_counts) = 'object' and pg_column_size(platter_counts) <= 8192)),
  add constraint seating_tables_style_fk foreign key (style_id, wedding_id)
    references public.seating_table_styles (id, wedding_id) on delete set null (style_id),
  add constraint seating_tables_rows_only check (shape = 'rows' and rows_count is not null or shape <> 'rows' and rows_count is null),
  add constraint seating_tables_aisle_rows_only check (aisle_cm is null or shape = 'rows'),
  add constraint seating_tables_segments_banquet_only check (segments is null or shape = 'banquet');

alter table public.seating_fixtures
  add column quantity        integer not null default 1 check (quantity between 1 and 9999),
  add column vendor_id       uuid,
  add column custom_item_id  uuid,
  add column marquee_id      uuid,
  add constraint seating_fixtures_vendor_fk foreign key (vendor_id, wedding_id)
    references public.vendors (id, wedding_id) on delete set null (vendor_id),
  add constraint seating_fixtures_custom_fk foreign key (custom_item_id, wedding_id)
    references public.seating_custom_items (id, wedding_id),
  add constraint seating_fixtures_marquee_fk foreign key (marquee_id, wedding_id)
    references public.seating_marquees (id, wedding_id),
  add constraint seating_fixtures_custom_kind check ((kind = 'custom') = (custom_item_id is not null)),
  add constraint seating_fixtures_marquee_kind check (marquee_id is null or kind = 'marquee');

alter table public.seat_assignments
  -- "Keep for now" on a declined guest's seat; the app clears it when that
  -- guest's reply for the event changes.
  add column decline_kept_at timestamptz,
  -- Per course id: true = own plate (shared and buffet courses).
  add column own_plate jsonb not null default '{}'::jsonb check (jsonb_typeof(own_plate) = 'object' and pg_column_size(own_plate) <= 4096),
  -- Per course id: overrides a child's default plated kids' meal.
  add column kids_meal jsonb not null default '{}'::jsonb check (jsonb_typeof(kids_meal) = 'object' and pg_column_size(kids_meal) <= 4096);

-- ---------------------------------------------------------------------------
-- 5. Tenancy, planner access, audit
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['seating_table_styles', 'seating_custom_items', 'seating_marquees',
                           'seating_item_counts', 'seating_share_links'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_collaborator(wedding_id)) with check (public.is_collaborator(wedding_id))',
      t || '_collaborator', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('insert into public.planner_table_access (table_name, access, note) values (%L, %L, null)', t, 'write');
    execute format('create policy %I on public.%I for select to authenticated using (public.can_plan(wedding_id))', t || '_planner_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_plan(wedding_id))', t || '_planner_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_plan(wedding_id)) with check (public.can_plan(wedding_id))', t || '_planner_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_plan(wedding_id))', t || '_planner_delete', t);
  end loop;
end;
$$;

-- seating_share_links is not audited: it holds credential hashes.
create trigger audit_row after insert or update or delete on public.seating_table_styles
  for each row execute function public.audit_row('id', '', 'name');
create trigger audit_row after insert or update or delete on public.seating_custom_items
  for each row execute function public.audit_row('id', '', 'name');
create trigger audit_row after insert or update or delete on public.seating_marquees
  for each row execute function public.audit_row('id', '', 'name');
create trigger audit_row after insert or update or delete on public.seating_item_counts
  for each row execute function public.audit_row('layout_id,item_key', '', 'item_key');

-- ---------------------------------------------------------------------------
-- 6. The plan as one jsonb, version 2
-- ---------------------------------------------------------------------------
-- Version 1 had the room size and tables, fixtures, seats, avoid-table rules
-- and blocked chairs. Version 2 adds the spaces (with their drawings), the
-- plan's service style, menu and settings, and every column above. Version 1
-- payloads (older History entries) still restore: what they lack takes its
-- default and every table lands in the layout's first space.
create or replace function public.seating_state(p_event_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'version', 2,
    'plan', (select jsonb_build_object('room_width_cm', p.room_width_cm, 'room_depth_cm', p.room_depth_cm,
                                       'colour_by', p.colour_by, 'service_style', p.service_style,
                                       'menu', p.menu, 'settings', p.settings)
               from public.seating_plans p where p.event_id = p_event_id),
    'spaces', coalesce((select jsonb_agg(to_jsonb(s) - 'created_at' - 'updated_at' order by s.sort_order, s.id)
                          from public.seating_spaces s
                          join public.seating_layouts l on l.id = s.layout_id
                         where l.event_id = p_event_id and l.is_live and l.deleted_at is null), '[]'::jsonb),
    'tables', coalesce((select jsonb_agg(to_jsonb(t) - 'created_at' - 'updated_at' order by t.sort_order, t.label, t.id)
                          from public.seating_tables t
                          join public.seating_layouts l on l.id = t.layout_id
                         where t.event_id = p_event_id and l.is_live and l.deleted_at is null), '[]'::jsonb),
    'fixtures', coalesce((select jsonb_agg(to_jsonb(f) - 'created_at' - 'updated_at' order by f.id)
                            from public.seating_fixtures f
                            join public.seating_layouts l on l.id = f.layout_id
                           where f.event_id = p_event_id and l.is_live and l.deleted_at is null), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(to_jsonb(a) - 'created_at' - 'updated_at' order by a.guest_id)
                               from public.seat_assignments a
                               join public.seating_layouts l on l.id = a.layout_id
                              where a.event_id = p_event_id and l.is_live and l.deleted_at is null), '[]'::jsonb),
    'avoid_rules', coalesce((select jsonb_agg(to_jsonb(r) - 'created_at' - 'updated_at' order by r.id)
                               from public.seating_rules r
                               join public.seating_tables t on t.id = r.table_id
                               join public.seating_layouts l on l.id = t.layout_id
                              where t.event_id = p_event_id and l.is_live and l.deleted_at is null), '[]'::jsonb),
    'blocked', coalesce((select jsonb_agg(to_jsonb(b) - 'created_at' order by b.table_id, b.seat_index)
                           from public.seating_chairs_blocked b
                           join public.seating_tables t on t.id = b.table_id
                           join public.seating_layouts l on l.id = t.layout_id
                          where b.event_id = p_event_id and l.is_live and l.deleted_at is null), '[]'::jsonb)
  );
$$;
revoke all on function public.seating_state(uuid) from public, anon;
grant execute on function public.seating_state(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Putting a state back (versions 1 and 2), into the event's live layout
-- ---------------------------------------------------------------------------
-- Same contract as 0053's: one transaction, refused with 40001 when the plan
-- no longer hashes to `p_expected_hash`. Ids that point outside the layout
-- (a vendor, a style, a marquee gone since) are dropped, not failed on.
create or replace function public.restore_seating_state(
  p_event_id uuid,
  p_payload jsonb,
  p_expected_hash text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_wedding uuid;
  v_layout uuid;
  v_tables int;
  v_fixtures int;
  v_seated int;
  v_total int;
  v_has_spaces boolean;
begin
  select e.wedding_id into v_wedding from public.events e where e.id = p_event_id;
  if v_wedding is null then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or (p_payload->>'version')::int is null or (p_payload->>'version')::int not in (1, 2) then
    raise exception 'unsupported seating state';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_event_id::text));
  if p_expected_hash is not null and public.seating_state_hash(p_event_id) <> p_expected_hash then
    raise exception 'the seating plan changed' using errcode = '40001';
  end if;

  v_layout := public.seating_live_layout(p_event_id);

  delete from public.seating_tables where event_id = p_event_id and layout_id = v_layout;   -- cascades chairs, blocked, rules
  delete from public.seating_fixtures where event_id = p_event_id and layout_id = v_layout;

  -- Spaces (version 2). The venue image is never put back by a restore, as
  -- before; a space deleted since comes back with the payload's.
  v_has_spaces := jsonb_typeof(p_payload->'spaces') = 'array' and jsonb_array_length(p_payload->'spaces') > 0;
  if v_has_spaces then
    insert into public.seating_spaces
      (id, wedding_id, layout_id, name, sort_order, room_width_cm, room_depth_cm,
       background_path, background_w_px, background_h_px, calibrated, background_opacity, drawing)
    select sp.id, v_wedding, v_layout, sp.name, coalesce(sp.sort_order, 0), sp.room_width_cm, sp.room_depth_cm,
           sp.background_path, sp.background_w_px, sp.background_h_px, coalesce(sp.calibrated, false),
           coalesce(sp.background_opacity, 45), coalesce(sp.drawing, '{}'::jsonb)
      from jsonb_populate_recordset(null::public.seating_spaces, p_payload->'spaces') sp
    on conflict (id) do update
      set name = excluded.name, sort_order = excluded.sort_order,
          room_width_cm = excluded.room_width_cm, room_depth_cm = excluded.room_depth_cm,
          background_opacity = excluded.background_opacity, drawing = excluded.drawing
      where public.seating_spaces.layout_id = v_layout;
    delete from public.seating_spaces s
     where s.layout_id = v_layout
       and s.id not in (select (x->>'id')::uuid from jsonb_array_elements(p_payload->'spaces') x);
  end if;

  insert into public.seating_tables
    (id, wedding_id, event_id, space_id, label, shape, capacity, reserved_seats, reserved_note,
     ends_seated, accessible, sort_order, notes, pos_x_cm, pos_y_cm, rotation_deg,
     width_cm, length_cm, rows_count, aisle_cm, segments, style_id, style_changes, platter_counts)
  select t.id, v_wedding, p_event_id,
         case when v_has_spaces and exists (select 1 from public.seating_spaces s where s.id = t.space_id and s.layout_id = v_layout)
              then t.space_id end,
         t.label, t.shape, t.capacity,
         coalesce(t.reserved_seats, 0), t.reserved_note, coalesce(t.ends_seated, false),
         coalesce(t.accessible, false), coalesce(t.sort_order, 0), t.notes,
         t.pos_x_cm, t.pos_y_cm, coalesce(t.rotation_deg, 0), t.width_cm, t.length_cm,
         t.rows_count, t.aisle_cm, t.segments,
         case when exists (select 1 from public.seating_table_styles st where st.id = t.style_id and st.wedding_id = v_wedding)
              then t.style_id end,
         t.style_changes, t.platter_counts
    from jsonb_populate_recordset(null::public.seating_tables, p_payload->'tables') t;
  get diagnostics v_tables = row_count;

  insert into public.seating_fixtures
    (id, wedding_id, event_id, space_id, kind, label, pos_x_cm, pos_y_cm, width_cm, depth_cm, rotation_deg,
     quantity, vendor_id, custom_item_id, marquee_id)
  select f.id, v_wedding, p_event_id,
         case when v_has_spaces and exists (select 1 from public.seating_spaces s where s.id = f.space_id and s.layout_id = v_layout)
              then f.space_id end,
         f.kind, f.label, f.pos_x_cm, f.pos_y_cm,
         f.width_cm, f.depth_cm, coalesce(f.rotation_deg, 0), coalesce(f.quantity, 1),
         case when exists (select 1 from public.vendors v where v.id = f.vendor_id and v.wedding_id = v_wedding)
              then f.vendor_id end,
         f.custom_item_id, f.marquee_id
    from jsonb_populate_recordset(null::public.seating_fixtures, p_payload->'fixtures') f;
  get diagnostics v_fixtures = row_count;

  insert into public.seat_assignments
    (wedding_id, event_id, guest_id, table_id, seat_index, decline_kept_at, own_plate, kids_meal)
  select v_wedding, p_event_id, a.guest_id, a.table_id, a.seat_index, a.decline_kept_at,
         coalesce(a.own_plate, '{}'::jsonb), coalesce(a.kids_meal, '{}'::jsonb)
    from jsonb_populate_recordset(null::public.seat_assignments, p_payload->'assignments') a
    join public.guests g on g.id = a.guest_id and g.wedding_id = v_wedding
   where g.deleted_at is null;
  get diagnostics v_seated = row_count;

  insert into public.seating_rules (id, wedding_id, kind, guest_a, table_id, note)
  select r.id, v_wedding, 'avoid_table', r.guest_a, r.table_id, r.note
    from jsonb_populate_recordset(null::public.seating_rules, p_payload->'avoid_rules') r
    join public.guests g on g.id = r.guest_a and g.wedding_id = v_wedding
   where g.deleted_at is null
  on conflict do nothing;

  insert into public.seating_chairs_blocked (wedding_id, event_id, table_id, seat_index)
  select v_wedding, p_event_id, b.table_id, b.seat_index
    from jsonb_populate_recordset(null::public.seating_chairs_blocked, coalesce(p_payload->'blocked', '[]'::jsonb)) b
  on conflict do nothing;

  if p_payload->'plan' is not null and jsonb_typeof(p_payload->'plan') = 'object' then
    insert into public.seating_plans
      (wedding_id, event_id, room_width_cm, room_depth_cm, colour_by, service_style, menu, settings)
    values (v_wedding, p_event_id,
            (p_payload->'plan'->>'room_width_cm')::int,
            (p_payload->'plan'->>'room_depth_cm')::int,
            p_payload->'plan'->>'colour_by',
            coalesce(p_payload->'plan'->>'service_style', 'plated'),
            coalesce(p_payload->'plan'->'menu', '[]'::jsonb),
            coalesce(p_payload->'plan'->'settings', '{}'::jsonb))
    on conflict (event_id) do update
      set room_width_cm = excluded.room_width_cm,
          room_depth_cm = excluded.room_depth_cm,
          colour_by = excluded.colour_by,
          service_style = excluded.service_style,
          menu = excluded.menu,
          settings = excluded.settings;
  end if;

  v_total := jsonb_array_length(coalesce(p_payload->'assignments', '[]'::jsonb));
  return jsonb_build_object(
    'tables', v_tables, 'fixtures', v_fixtures, 'seated', v_seated, 'skipped', v_total - v_seated,
    'hash', public.seating_state_hash(p_event_id));
end;
$$;
revoke all on function public.restore_seating_state(uuid, jsonb, text) from public, anon;
grant execute on function public.restore_seating_state(uuid, jsonb, text) to authenticated;

-- A snapshot of either version restores.
create or replace function public.restore_seating_snapshot(
  p_snapshot_id uuid,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  s public.seating_snapshots;
  v_result jsonb;
begin
  select * into s from public.seating_snapshots where id = p_snapshot_id;
  if s.id is null then
    raise exception 'snapshot not found' using errcode = 'P0002';
  end if;
  if (s.payload->>'version')::int is null or (s.payload->>'version')::int not in (1, 2) then
    raise exception 'unsupported snapshot version %', s.payload->>'version';
  end if;

  perform public.take_seating_snapshot(
    s.event_id, left(format('Before restoring "%s"', s.name), 120), true, p_created_by);

  v_result := public.restore_seating_state(s.event_id, s.payload, null);
  return v_result - 'hash';
end;
$$;
