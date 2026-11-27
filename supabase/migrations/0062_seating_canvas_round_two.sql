-- 0062_seating_canvas_round_two.sql  (spec 59 Parts D and E, spec 60 Part A and E.2)
--
-- What a table carries, locks, a draw order, and one database call for a whole
-- selection.
--
--   * seating_tables.table_items  The décor and dishes placed on a table's top
--                                 (spec 59 D.1). Positions are fractions of the
--                                 table's length and width, so they survive a resize.
--   * seating_table_styles.item_rules  Items placed by rule: "a platter every
--                                 three seats", "flowers at each end" (D.2).
--   * seating_tables.locked / seating_fixtures.locked  Lock item (spec 60 A.3):
--                                 a table or a piece of furniture held still. Separate
--                                 from the room lock (seating_layouts.locked_at).
--   * seating_fixtures.z          Draw order among furniture and décor in a space
--                                 (A.4), ties by creation time. Tables draw above both.
--   * restore_seating_state()     Redefined to carry the new columns, or undo and
--                                 History silently drop them. seating_state() and
--                                 seating_try_layout() build rows from to_jsonb() and
--                                 jsonb_populate_record(), so they carry them already.
--   * seating_apply_items()       One transaction for a whole move, resize, copy,
--                                 delete, stamp, lock or reorder (A.5), with the
--                                 stale-position check that refuses a move when
--                                 someone else changed the item first (E.2).
--
-- Notes for vendors (spec 59 Part E) live inside each space's drawing (a new
-- element kind), so they need no column.
--
-- Not edited: 0053, 0057, 0059.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.seating_tables
  add column table_items jsonb not null default '[]'::jsonb
    check (jsonb_typeof(table_items) = 'array' and jsonb_array_length(table_items) <= 200 and pg_column_size(table_items) <= 32768),
  add column locked boolean not null default false;

alter table public.seating_fixtures
  add column locked boolean not null default false,
  add column z integer not null default 0;

alter table public.seating_table_styles
  add column item_rules jsonb not null default '[]'::jsonb
    check (jsonb_typeof(item_rules) = 'array' and jsonb_array_length(item_rules) <= 40 and pg_column_size(item_rules) <= 16384);

-- ---------------------------------------------------------------------------
-- 2. Undo and History carry the new columns
-- ---------------------------------------------------------------------------
-- 0059's function, with table_items, locked and z in the two inserts. A state
-- taken before this migration has none of them: they take their defaults.
create or replace function public.restore_seating_state(
  p_event_id uuid,
  p_payload jsonb,
  p_expected_hash text default null,
  p_layout_id uuid default null
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

  if p_layout_id is null then
    v_layout := public.seating_live_layout(p_event_id);
  else
    select y.id into v_layout from public.seating_layouts y
     where y.id = p_layout_id and y.event_id = p_event_id and y.deleted_at is null;
    if v_layout is null then
      raise exception 'layout not found' using errcode = 'P0002';
    end if;
  end if;

  if p_expected_hash is not null and public.seating_state_hash(p_event_id, v_layout) <> p_expected_hash then
    raise exception 'the seating plan changed' using errcode = '40001';
  end if;

  delete from public.seating_tables where event_id = p_event_id and layout_id = v_layout;   -- cascades chairs, blocked, rules
  delete from public.seating_fixtures where event_id = p_event_id and layout_id = v_layout;

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
    (id, wedding_id, event_id, layout_id, space_id, label, shape, capacity, reserved_seats, reserved_note,
     ends_seated, accessible, sort_order, notes, pos_x_cm, pos_y_cm, rotation_deg,
     width_cm, length_cm, rows_count, aisle_cm, segments, style_id, style_changes, platter_counts,
     table_items, locked)
  select t.id, v_wedding, p_event_id, v_layout,
         case when v_has_spaces and exists (select 1 from public.seating_spaces s where s.id = t.space_id and s.layout_id = v_layout)
              then t.space_id end,
         t.label, t.shape, t.capacity,
         coalesce(t.reserved_seats, 0), t.reserved_note, coalesce(t.ends_seated, false),
         coalesce(t.accessible, false), coalesce(t.sort_order, 0), t.notes,
         t.pos_x_cm, t.pos_y_cm, coalesce(t.rotation_deg, 0), t.width_cm, t.length_cm,
         t.rows_count, t.aisle_cm, t.segments,
         case when exists (select 1 from public.seating_table_styles st where st.id = t.style_id and st.wedding_id = v_wedding)
              then t.style_id end,
         t.style_changes, t.platter_counts,
         coalesce(t.table_items, '[]'::jsonb), coalesce(t.locked, false)
    from jsonb_populate_recordset(null::public.seating_tables, p_payload->'tables') t;
  get diagnostics v_tables = row_count;

  insert into public.seating_fixtures
    (id, wedding_id, event_id, layout_id, space_id, kind, label, pos_x_cm, pos_y_cm, width_cm, depth_cm, rotation_deg,
     quantity, vendor_id, custom_item_id, marquee_id, locked, z)
  select f.id, v_wedding, p_event_id, v_layout,
         case when v_has_spaces and exists (select 1 from public.seating_spaces s where s.id = f.space_id and s.layout_id = v_layout)
              then f.space_id end,
         f.kind, f.label, f.pos_x_cm, f.pos_y_cm,
         f.width_cm, f.depth_cm, coalesce(f.rotation_deg, 0), coalesce(f.quantity, 1),
         case when exists (select 1 from public.vendors v where v.id = f.vendor_id and v.wedding_id = v_wedding)
              then f.vendor_id end,
         f.custom_item_id, f.marquee_id, coalesce(f.locked, false), coalesce(f.z, 0)
    from jsonb_populate_recordset(null::public.seating_fixtures, p_payload->'fixtures') f;
  get diagnostics v_fixtures = row_count;

  insert into public.seat_assignments
    (wedding_id, event_id, layout_id, guest_id, table_id, seat_index, decline_kept_at, own_plate, kids_meal)
  select v_wedding, p_event_id, v_layout, a.guest_id, a.table_id, a.seat_index, a.decline_kept_at,
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
    'hash', public.seating_state_hash(p_event_id, v_layout));
end;
$$;
revoke all on function public.restore_seating_state(uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.restore_seating_state(uuid, jsonb, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. One transaction for a whole selection (spec 60 A.5, E.2)
-- ---------------------------------------------------------------------------
-- p_op, and what each item in p_items looks like (all of it is checked before
-- anything is written; any failure raises, and the transaction undoes the rest):
--
--   move     { kind, id, x, y, rotation?, from? }   from = { x, y, rotation } is where the screen
--                                                   last saw it; if the row is anywhere else the whole
--                                                   call is refused ('seating_stale', E.2).
--   resize   { kind, id, x, y, width, depth, from? } one table (round, square, long, head, sweetheart,
--                                                   oval) or fixture; the opposite edge stays put, so
--                                                   the centre is written with the size.
--   copy     { kind, id, x, y, rotation? }          copies into p_space_id with fresh ids; table copies
--                                                   take a fresh name and no guests, and are unlocked.
--   delete   { kind, id }
--   stamp    { kind: 'fixture', fixture_kind, x, y, width, depth, label?, custom_item_id?, marquee_id? }
--            { kind: 'table', shape, capacity, reserved_seats?, x, y }   new things, into p_space_id.
--   lock     { kind, id, locked }                   Lock item / unlock (A.3).
--   front, back  { kind: 'fixture', id }            Bring to front / Send to back (A.4); tables are
--                                                   always above furniture and décor, so they are skipped.
--
-- Refused whole, with these messages: 'seating_layout_not_found' (not this event's, or deleted),
-- 'seating_room_locked', 'seating_item_missing' (not in this layout), 'seating_item_locked' (a held
-- item can't be moved, resized or deleted), 'seating_stale', 'seating_space_not_found',
-- 'seating_shape_not_resizable'.
create or replace function public.seating_apply_items(
  p_event_id uuid,
  p_layout_id uuid,
  p_op text,
  p_items jsonb,
  p_space_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_layout public.seating_layouts%rowtype;
  v_wedding uuid;
  v_space uuid;
  v_item jsonb;
  v_kind text;
  v_id uuid;
  v_from jsonb;
  v_t public.seating_tables%rowtype;
  v_f public.seating_fixtures%rowtype;
  v_new uuid;
  v_label text;
  v_next int;
  v_sort int;
  v_rot int;
  v_z int;
  v_made_tables uuid[] := '{}';
  v_made_fixtures uuid[] := '{}';
  v_count int := 0;
  v_single boolean;
begin
  if p_op is null or p_op not in ('move', 'resize', 'copy', 'delete', 'stamp', 'lock', 'front', 'back') then
    raise exception 'unknown operation' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 500 then
    raise exception 'nothing to do' using errcode = '22023';
  end if;

  -- The layout on screen: this event's, not deleted, and not locked. (security invoker: a stranger sees no row.)
  select * into v_layout from public.seating_layouts y
   where y.id = p_layout_id and y.event_id = p_event_id and y.deleted_at is null;
  if not found then
    raise exception 'seating_layout_not_found' using errcode = 'P0002';
  end if;
  if v_layout.locked_at is not null then
    raise exception 'seating_room_locked' using errcode = 'P0001';
  end if;
  v_wedding := v_layout.wedding_id;

  perform pg_advisory_xact_lock(hashtext(p_event_id::text));

  if p_op in ('copy', 'stamp') then
    select s.id into v_space from public.seating_spaces s
     where s.id = coalesce(p_space_id, public.seating_first_space(p_layout_id)) and s.layout_id = p_layout_id;
    if v_space is null then
      raise exception 'seating_space_not_found' using errcode = 'P0002';
    end if;
    select coalesce(max(sort_order), 0) into v_sort from public.seating_tables where layout_id = p_layout_id;
    select coalesce(max((regexp_match(label, '^table\s+(\d+)$', 'i'))[1]::int), 0) into v_next
      from public.seating_tables where layout_id = p_layout_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_kind := v_item->>'kind';
    if v_kind not in ('table', 'fixture') then
      raise exception 'nothing to do' using errcode = '22023';
    end if;

    -- New things -------------------------------------------------------------
    if p_op = 'stamp' then
      if v_kind = 'fixture' then
        insert into public.seating_fixtures
          (wedding_id, event_id, layout_id, space_id, kind, label, pos_x_cm, pos_y_cm, width_cm, depth_cm,
           custom_item_id, marquee_id)
        values (v_wedding, p_event_id, p_layout_id, v_space,
                (v_item->>'fixture_kind')::public.seating_fixture_kind, nullif(v_item->>'label', ''),
                round((v_item->>'x')::numeric)::int, round((v_item->>'y')::numeric)::int,
                (v_item->>'width')::int, (v_item->>'depth')::int,
                nullif(v_item->>'custom_item_id', '')::uuid, nullif(v_item->>'marquee_id', '')::uuid)
        returning id into v_new;
        v_made_fixtures := v_made_fixtures || v_new;
      else
        v_next := v_next + 1;
        v_sort := v_sort + 1;
        insert into public.seating_tables
          (wedding_id, event_id, layout_id, space_id, label, shape, capacity, reserved_seats, sort_order, pos_x_cm, pos_y_cm)
        values (v_wedding, p_event_id, p_layout_id, v_space, 'Table ' || v_next,
                (v_item->>'shape')::public.seating_table_shape, (v_item->>'capacity')::int,
                coalesce((v_item->>'reserved_seats')::int, 0), v_sort,
                round((v_item->>'x')::numeric)::int, round((v_item->>'y')::numeric)::int)
        returning id into v_new;
        v_made_tables := v_made_tables || v_new;
      end if;
      v_count := v_count + 1;
      continue;
    end if;

    -- Things that are already there ---------------------------------------------
    v_id := (v_item->>'id')::uuid;
    v_from := v_item->'from';
    v_rot := case when v_item ? 'rotation' and v_item->>'rotation' is not null
                  then ((round((v_item->>'rotation')::numeric)::int % 360) + 360) % 360 end;

    if v_kind = 'table' then
      select * into v_t from public.seating_tables
       where id = v_id and event_id = p_event_id and layout_id = p_layout_id for update;
      if not found then
        raise exception 'seating_item_missing' using errcode = 'P0002';
      end if;
      if v_t.locked and p_op in ('move', 'resize', 'delete') then
        raise exception 'seating_item_locked' using errcode = 'P0001';
      end if;
      if p_op in ('move', 'resize') and v_from is not null and jsonb_typeof(v_from) = 'object' then
        if v_t.pos_x_cm is distinct from (v_from->>'x')::int
           or v_t.pos_y_cm is distinct from (v_from->>'y')::int
           or v_t.rotation_deg is distinct from coalesce((v_from->>'rotation')::int, v_t.rotation_deg) then
          raise exception 'seating_stale' using errcode = '40001';
        end if;
      end if;

      if p_op = 'move' then
        update public.seating_tables
           set pos_x_cm = round((v_item->>'x')::numeric)::int, pos_y_cm = round((v_item->>'y')::numeric)::int,
               rotation_deg = coalesce(v_rot, rotation_deg)
         where id = v_id;
      elsif p_op = 'resize' then
        if v_t.shape::text not in ('round', 'square', 'long', 'head', 'sweetheart', 'oval') then
          raise exception 'seating_shape_not_resizable' using errcode = '22023';
        end if;
        v_single := v_t.shape::text in ('round', 'square');
        update public.seating_tables
           set pos_x_cm = round((v_item->>'x')::numeric)::int, pos_y_cm = round((v_item->>'y')::numeric)::int,
               length_cm = (v_item->>'width')::int,
               width_cm = case when v_single then (v_item->>'width')::int else (v_item->>'depth')::int end
         where id = v_id;
      elsif p_op = 'copy' then
        v_next := v_next + 1;
        v_sort := v_sort + 1;
        insert into public.seating_tables
        select (jsonb_populate_record(null::public.seating_tables,
                  to_jsonb(v_t) || jsonb_build_object(
                    'id', gen_random_uuid(), 'space_id', v_space, 'label', 'Table ' || v_next, 'sort_order', v_sort,
                    'pos_x_cm', round((v_item->>'x')::numeric)::int, 'pos_y_cm', round((v_item->>'y')::numeric)::int,
                    'rotation_deg', coalesce(v_rot, v_t.rotation_deg), 'locked', false, 'platter_counts', null,
                    'created_at', now(), 'updated_at', now()))).*
        returning id into v_new;
        v_made_tables := v_made_tables || v_new;
      elsif p_op = 'delete' then
        delete from public.seating_tables where id = v_id;   -- the guests go back to the tray (their seats cascade)
      elsif p_op = 'lock' then
        update public.seating_tables set locked = coalesce((v_item->>'locked')::boolean, true) where id = v_id;
      elsif p_op in ('front', 'back') then
        null; -- tables always draw above furniture and décor: nothing to order
      end if;
    else
      select * into v_f from public.seating_fixtures
       where id = v_id and event_id = p_event_id and layout_id = p_layout_id for update;
      if not found then
        raise exception 'seating_item_missing' using errcode = 'P0002';
      end if;
      if v_f.locked and p_op in ('move', 'resize', 'delete') then
        raise exception 'seating_item_locked' using errcode = 'P0001';
      end if;
      if p_op in ('move', 'resize') and v_from is not null and jsonb_typeof(v_from) = 'object' then
        if v_f.pos_x_cm is distinct from (v_from->>'x')::int
           or v_f.pos_y_cm is distinct from (v_from->>'y')::int
           or v_f.rotation_deg is distinct from coalesce((v_from->>'rotation')::int, v_f.rotation_deg)
           or v_f.width_cm is distinct from coalesce((v_from->>'width')::int, v_f.width_cm)
           or v_f.depth_cm is distinct from coalesce((v_from->>'depth')::int, v_f.depth_cm) then
          raise exception 'seating_stale' using errcode = '40001';
        end if;
      end if;

      if p_op = 'move' then
        update public.seating_fixtures
           set pos_x_cm = round((v_item->>'x')::numeric)::int, pos_y_cm = round((v_item->>'y')::numeric)::int,
               rotation_deg = coalesce(v_rot, rotation_deg)
         where id = v_id;
      elsif p_op = 'resize' then
        update public.seating_fixtures
           set pos_x_cm = round((v_item->>'x')::numeric)::int, pos_y_cm = round((v_item->>'y')::numeric)::int,
               width_cm = (v_item->>'width')::int, depth_cm = (v_item->>'depth')::int
         where id = v_id;
      elsif p_op = 'copy' then
        insert into public.seating_fixtures
        select (jsonb_populate_record(null::public.seating_fixtures,
                  to_jsonb(v_f) || jsonb_build_object(
                    'id', gen_random_uuid(), 'space_id', v_space,
                    'pos_x_cm', round((v_item->>'x')::numeric)::int, 'pos_y_cm', round((v_item->>'y')::numeric)::int,
                    'rotation_deg', coalesce(v_rot, v_f.rotation_deg), 'locked', false,
                    'created_at', now(), 'updated_at', now()))).*
        returning id into v_new;
        v_made_fixtures := v_made_fixtures || v_new;
      elsif p_op = 'delete' then
        delete from public.seating_fixtures where id = v_id;
      elsif p_op = 'lock' then
        update public.seating_fixtures set locked = coalesce((v_item->>'locked')::boolean, true) where id = v_id;
      elsif p_op = 'front' then
        select coalesce(max(z), 0) + 1 into v_z from public.seating_fixtures where space_id = v_f.space_id;
        update public.seating_fixtures set z = v_z where id = v_id;
      elsif p_op = 'back' then
        select coalesce(min(z), 0) - 1 into v_z from public.seating_fixtures where space_id = v_f.space_id;
        update public.seating_fixtures set z = v_z where id = v_id;
      end if;
    end if;
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('count', v_count, 'tables', to_jsonb(v_made_tables), 'fixtures', to_jsonb(v_made_fixtures));
end;
$$;
revoke all on function public.seating_apply_items(uuid, uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.seating_apply_items(uuid, uuid, text, jsonb, uuid) to authenticated;
