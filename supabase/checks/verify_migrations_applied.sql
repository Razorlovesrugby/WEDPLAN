-- Which migrations have been applied to this database?  (read-only)
--
-- Paste the whole file into the Supabase SQL editor and run it. It returns one
-- row per migration file, 0001 to 0061:
--
--   applied        the objects that migration creates (or changes) are there
--   MISSING        something it creates is not there, so it has not run, or
--                  only part of it did. Apply it (README: apply them in order,
--                  0055 on its own first), then run this again.
--   not checkable  the migration changes no table, column or function
--
-- It looks at the database itself rather than at supabase_migrations, because
-- a migration pasted into the SQL editor (how this project applies them) is
-- never recorded there. The first row is a summary. MISSING rows sort first.
--
-- One check per migration is a spot check of the objects it adds; it does not
-- prove every line of a file ran. The list is a copy of supabase/migrations: a
-- new migration needs a new row below (SQL cannot read the directory).

with
rel as (  -- tables, views, materialized views
  select c.relname::text as k
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
),
col as (  -- "table.column", for tables and views
  select (c.relname || '.' || a.attname)::text as k
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') and a.attnum > 0 and not a.attisdropped
),
fn as (   -- functions, by name
  select p.proname::text as k
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
),
enm as (  -- "enum_type.label"
  select (t.typname || '.' || e.enumlabel)::text as k
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public'
),
typ as (
  select t.typname::text as k
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public'
),
idx as (
  select indexname::text as k from pg_indexes where schemaname = 'public'
),
con as (  -- "table.constraint", with its definition
  select (cl.relname || '.' || co.conname)::text as k, pg_get_constraintdef(co.oid) as def
    from pg_constraint co
    join pg_class cl on cl.oid = co.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
   where n.nspname = 'public'
),
views as (
  select c.relname::text as k, pg_get_viewdef(c.oid) as def
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
),
checks(migration, looked_for, ok) as (values
  ('0001_core_schema',
   'weddings, guests, events, households, invitations',
   ('weddings' in (select k from rel)
      and 'guests' in (select k from rel)
      and 'events' in (select k from rel)
      and 'households' in (select k from rel)
      and 'invitations' in (select k from rel))),
  ('0002_row_level_security',
   'is_collaborator()',
   ('is_collaborator' in (select k from fn))),
  ('0003_derived_views',
   'v_households, v_household_rsvp, v_wedding_stats',
   ('v_households' in (select k from rel)
      and 'v_household_rsvp' in (select k from rel)
      and 'v_wedding_stats' in (select k from rel))),
  ('0004_lists',
   'lists, list_items, v_timeline_items',
   ('lists' in (select k from rel)
      and 'list_items' in (select k from rel)
      and 'v_timeline_items' in (select k from rel))),
  ('0005_lists_status_assignment',
   'list_items.status',
   ('list_items.status' in (select k from col))),
  ('0006_reminders',
   'message_kind ''digest''',
   ('message_kind.digest' in (select k from enm))),
  ('0007_settings',
   'weddings.reminder_window_days',
   ('weddings.reminder_window_days' in (select k from col))),
  ('0008_multi_cut_lines',
   'cut_lines',
   ('cut_lines' in (select k from rel))),
  ('0009_run_sheet',
   'run_sheet_items',
   ('run_sheet_items' in (select k from rel))),
  ('0010_budget',
   'budget_categories, budget_items, payments, v_budget_summary',
   ('budget_categories' in (select k from rel)
      and 'budget_items' in (select k from rel)
      and 'payments' in (select k from rel)
      and 'v_budget_summary' in (select k from rel))),
  ('0011_budget_manual_quantity',
   'budget_quantity_basis ''manual''',
   ('budget_quantity_basis.manual' in (select k from enm))),
  ('0011_budget_manual_quantity_columns',
   'budget_items.quantity',
   ('budget_items.quantity' in (select k from col))),
  ('0012_budget_tier_position',
   'budget_guest_population() (later migrations replace its body)',
   ('budget_guest_population' in (select k from fn))),
  ('0013_moodboards',
   'moodboards, moodboard_items, moodboard_shares',
   ('moodboards' in (select k from rel)
      and 'moodboard_items' in (select k from rel)
      and 'moodboard_shares' in (select k from rel))),
  ('0014_moodboard_clipper',
   'pinterest_accounts, moodboard_clip_tokens',
   ('pinterest_accounts' in (select k from rel)
      and 'moodboard_clip_tokens' in (select k from rel))),
  ('0015_wedding_slug',
   'weddings.slug, slugify()',
   ('weddings.slug' in (select k from col)
      and 'slugify' in (select k from fn))),
  ('0016_list_content_and_calculated_dates',
   'list_items.due_date_offset_days',
   ('list_items.due_date_offset_days' in (select k from col))),
  ('0016_save_the_date',
   'message_kind ''save_the_date''',
   ('message_kind.save_the_date' in (select k from enm))),
  ('0017_budget_section_links',
   'budget_item_sections',
   ('budget_item_sections' in (select k from rel))),
  ('0017_public_site',
   'site_assets, coach_runs, accommodations',
   ('site_assets' in (select k from rel)
      and 'coach_runs' in (select k from rel)
      and 'accommodations' in (select k from rel))),
  ('0018_section_notes',
   'list_sections.notes, and list_sections.kind gone',
   ('list_sections.notes' in (select k from col)
      and not ('list_sections.kind' in (select k from col)))),
  ('0019_budget_nzd_and_gst',
   'budget_items.gst_treatment, and fx_rates gone',
   ('budget_items.gst_treatment' in (select k from col)
      and not ('fx_rates' in (select k from rel)))),
  ('0020_budget_allocations',
   'weddings.total_budget, v_budget_category_totals',
   ('weddings.total_budget' in (select k from col)
      and 'v_budget_category_totals' in (select k from rel))),
  ('0021_budget_zero_is_not_a_figure',
   'v_budget_items treats a typed 0 as no figure (nullif)',
   (coalesce((select def ilike '%nullif%' from views where k = 'v_budget_items'), false))),
  ('0022_household_slugs',
   'household_slug_aliases, households.slug',
   ('household_slug_aliases' in (select k from rel)
      and 'households.slug' in (select k from col))),
  ('0023_per_event_invites',
   'guest_event_overrides, v_guest_event_invites',
   ('guest_event_overrides' in (select k from rel)
      and 'v_guest_event_invites' in (select k from rel))),
  ('0024_block_audience',
   'type block_audience',
   ('block_audience' in (select k from typ))),
  ('0025_site_blocks',
   'site_blocks, song_requests',
   ('site_blocks' in (select k from rel)
      and 'song_requests' in (select k from rel))),
  ('0026_dress_codes_and_travel',
   'dress_codes, arrival_points',
   ('dress_codes' in (select k from rel)
      and 'arrival_points' in (select k from rel))),
  ('0027_guest_participation',
   'song_votes, guest_notes',
   ('song_votes' in (select k from rel)
      and 'guest_notes' in (select k from rel))),
  ('0028_editorial_default',
   '(data only: pins existing weddings to a theme)',
   null::boolean),
  ('0029_vendors',
   'vendors, vendor_contacts, v_vendors',
   ('vendors' in (select k from rel)
      and 'vendor_contacts' in (select k from rel)
      and 'v_vendors' in (select k from rel))),
  ('0030_gift_funds',
   'gift_funds',
   ('gift_funds' in (select k from rel))),
  ('0031_save_the_date_views',
   'v_household_rsvp.std_last_viewed_at',
   ('v_household_rsvp.std_last_viewed_at' in (select k from col))),
  ('0032_site_asset_images',
   'site_assets.variants',
   ('site_assets.variants' in (select k from col))),
  ('0033_gift_bank_details',
   'gift_bank_details',
   ('gift_bank_details' in (select k from rel))),
  ('0034_save_the_date_tracking',
   'guests.unable_to_attend_at',
   ('guests.unable_to_attend_at' in (select k from col))),
  ('0035_audit_log',
   'audit_log, audit_row()',
   ('audit_log' in (select k from rel)
      and 'audit_row' in (select k from fn))),
  ('0036_seating',
   'seating_tables, seat_assignments, seating_snapshots',
   ('seating_tables' in (select k from rel)
      and 'seat_assignments' in (select k from rel)
      and 'seating_snapshots' in (select k from rel))),
  ('0037_song_chart',
   'song_requests.played_at',
   ('song_requests.played_at' in (select k from col))),
  ('0038_registry_asset_kind',
   'site_asset_kind ''registry''',
   ('site_asset_kind.registry' in (select k from enm))),
  ('0039_registry',
   'registry_items, registry_claims, claim_registry_item()',
   ('registry_items' in (select k from rel)
      and 'registry_claims' in (select k from rel)
      and 'claim_registry_item' in (select k from fn))),
  ('0040_guest_questions',
   'guest_questions',
   ('guest_questions' in (select k from rel))),
  ('0041_events_is_main',
   'events.is_main',
   ('events.is_main' in (select k from col))),
  ('0042_registry_contribute',
   'registry_settings.contribute_position',
   ('registry_settings.contribute_position' in (select k from col))),
  ('0043_people',
   'people, list_items.assigned_person_id',
   ('people' in (select k from rel)
      and 'list_items.assigned_person_id' in (select k from col))),
  ('0044_planner_access',
   'planner_table_access, can_plan()',
   ('planner_table_access' in (select k from rel)
      and 'can_plan' in (select k from fn))),
  ('0045_onboarding_timezone_currency',
   'weddings.currency, create_wedding()',
   ('weddings.currency' in (select k from col)
      and 'create_wedding' in (select k from fn))),
  ('0046_registry_use_site_theme',
   'registry_settings.use_site_theme',
   ('registry_settings.use_site_theme' in (select k from col))),
  ('0047_rsvp_answers_upsert_keys',
   'the two unique indexes the RSVP upserts name',
   ('rsvp_answers_question_guest_key' in (select k from idx)
      and 'rsvp_answers_question_household_key' in (select k from idx))),
  ('0048_run_sheet_one_timeline',
   'run_sheet_item_assignees, run_sheet_items.starts_at, save_run_sheet_item()',
   ('run_sheet_item_assignees' in (select k from rel)
      and 'run_sheet_items.starts_at' in (select k from col)
      and 'save_run_sheet_item' in (select k from fn))),
  ('0049_event_types_and_features',
   'event_types, events.type_id, seed_event_types()',
   ('event_types' in (select k from rel)
      and 'events.type_id' in (select k from col)
      and 'seed_event_types' in (select k from fn))),
  ('0050_day_links',
   'day_links, day_activity, day_contacts',
   ('day_links' in (select k from rel)
      and 'day_activity' in (select k from rel)
      and 'day_contacts' in (select k from rel))),
  ('0051_day_links_rest',
   'helper_groups, day_announcements, claim_open_task()',
   ('helper_groups' in (select k from rel)
      and 'day_announcements' in (select k from rel)
      and 'claim_open_task' in (select k from fn))),
  ('0052_shot_list',
   'shot_sections, shots, shot_people',
   ('shot_sections' in (select k from rel)
      and 'shots' in (select k from rel)
      and 'shot_people' in (select k from rel))),
  ('0053_seating_workspace',
   'seating_chairs_blocked, seating_checkins, guests.needs_highchair',
   ('seating_chairs_blocked' in (select k from rel)
      and 'seating_checkins' in (select k from rel)
      and 'guests.needs_highchair' in (select k from col))),
  ('0054_day_master',
   'collaborators.day_alerts, set_my_day_alerts()',
   ('collaborators.day_alerts' in (select k from col)
      and 'set_my_day_alerts' in (select k from fn))),
  ('0055_venue_designer_enums',
   'seating_table_shape ''sweetheart'', ''rows'', ''oval'', ''half_moon'', ''serpentine'', ''banquet''; seating_fixture_kind ''custom''',
   ('seating_table_shape.sweetheart' in (select k from enm)
      and 'seating_table_shape.rows' in (select k from enm)
      and 'seating_table_shape.oval' in (select k from enm)
      and 'seating_table_shape.half_moon' in (select k from enm)
      and 'seating_table_shape.serpentine' in (select k from enm)
      and 'seating_table_shape.banquet' in (select k from enm)
      and 'seating_fixture_kind.custom' in (select k from enm))),
  ('0056_seating_layouts_and_spaces',
   'seating_layouts, seating_spaces, seating_tables.layout_id',
   ('seating_layouts' in (select k from rel)
      and 'seating_spaces' in (select k from rel)
      and 'seating_tables.layout_id' in (select k from col)
      and 'seating_fixtures.layout_id' in (select k from col)
      and 'seat_assignments.layout_id' in (select k from col))),
  ('0057_venue_designer',
   'seating_table_styles, seating_item_counts, seating_share_links, seating_plans.menu, seat_assignments.own_plate',
   ('seating_table_styles' in (select k from rel)
      and 'seating_custom_items' in (select k from rel)
      and 'seating_marquees' in (select k from rel)
      and 'seating_item_counts' in (select k from rel)
      and 'seating_share_links' in (select k from rel)
      and 'seating_plans.menu' in (select k from col)
      and 'seat_assignments.own_plate' in (select k from col))),
  ('0058_guest_dietary_needs',
   'guest_dietary_needs',
   ('guest_dietary_needs' in (select k from rel))),
  ('0059_seating_drafts',
   'seat key is (guest_id, layout_id); v_live_* views; seating_try_layout(), seating_make_live(); snapshots per layout; room trigger gone',
   (exists (select 1 from con where k = 'seat_assignments.seat_assignments_pkey' and def like 'PRIMARY KEY (guest_id, layout_id)')
      and 'v_live_seat_assignments' in (select k from rel)
      and 'v_live_seating_tables' in (select k from rel)
      and 'seating_try_layout' in (select k from fn)
      and 'seating_make_live' in (select k from fn)
      and 'seating_snapshots.layout_id' in (select k from col)
      and not ('seating_plans_follow' in (select k from fn)))),
  ('0060_seating_large_blocks',
   'seating_tables capacity check allows 400 for rows and banquet',
   (exists (select 1 from con where k = 'seating_tables.seating_tables_capacity_check' and def like '%400%'))),
  ('0061_seating_share_check',
   'seating_share_check(), seating_share_links.failed_attempts',
   ('seating_share_check' in (select k from fn)
      and 'seating_share_links.failed_attempts' in (select k from col)))
),
result as (
  select migration,
         looked_for,
         case when ok is null then 'not checkable' when ok then 'applied' else 'MISSING' end as status
    from checks
)
select migration, looked_for, status
  from (
    select 0 as o,
           '0000_SUMMARY' as migration,
           count(*) filter (where status = 'applied') || ' applied, '
             || count(*) filter (where status = 'MISSING') || ' MISSING, '
             || count(*) filter (where status = 'not checkable') || ' not checkable (of ' || count(*) || ' files)' as looked_for,
           case when count(*) filter (where status = 'MISSING') = 0 then 'ALL APPLIED' else 'SOME MISSING' end as status
      from result
    union all
    select case when status = 'MISSING' then 1 else 2 end, migration, looked_for, status from result
  ) r
 order by o, migration;
