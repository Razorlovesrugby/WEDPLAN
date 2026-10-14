-- ===========================================================================
-- 0035: an audit log of who changed what (spec 32, Part B)
-- ===========================================================================
-- One append-only table, written only by a trigger. The trigger lives in the
-- database rather than in each server action for one reason: it catches every
-- write path — server actions, the service-role public routes (RSVP, reply,
-- song requests), a fix pasted into the SQL editor, and any future code that
-- forgets to log. A log that depends on every caller remembering is a log with
-- holes.
--
-- WHAT IS RECORDED
--   insert / delete  the whole row (a delete's row is what lets you bring it back)
--   update           only the columns that changed, as {col: [old, new]}
-- Updates are diffs because site and list rows carry large JSON and the free
-- database is 500 MB.
--
-- WHAT IS NOT
--   * An update where nothing but `updated_at`, `rank` or `sort_order` changed
--     writes no row at all (Q5): dragging one guest up a ranked list re-numbers
--     dozens of neighbours, and none of that is a decision anyone made.
--   * Tracking and log tables — invitation_views, site_visits,
--     rsvp_token_attempts (high volume, nobody edits them), message_log and
--     site_revisions (already a history), moodboard_clip_tokens and
--     pinterest_accounts (secrets: never copied anywhere).
--   * Secret columns on audited tables, whose VALUES are replaced with
--     "[redacted]" while the fact of the change is still logged: bank details,
--     and every token hash / ciphertext. Without this the audit log would be a
--     second, more readable copy of the bank account number.
--
-- WHO
--   `actor_id` is auth.uid() — the signed-in planner. A write with no signed-in
--   user (a guest on their link, the cron, a fix from the SQL editor) has none,
--   so `actor_kind` is 'public'. The two can't be told apart from inside the
--   database, and the table written says which it was (a guest's RSVP is not
--   something the cron does) — the page labels it. Names are NOT stored: the
--   page joins collaborators.display_name at read time so a rename updates
--   history.
--
-- NO FOREIGN KEY to weddings, on purpose. The log is immutable (a guard trigger
-- below refuses UPDATE and DELETE); an FK with ON DELETE CASCADE would make
-- deleting a wedding fail on the guard, and the log of what happened to a
-- wedding should not vanish with it. Retention (prune_audit_log) is what
-- removes old rows.
--
-- IMMUTABLE. `authenticated` has SELECT and nothing else; the guard trigger
-- raises on UPDATE/DELETE even for the owner. The only deletion path is
-- prune_audit_log(), which sets a transaction-local flag the guard honours.
-- service_role can still bypass RLS — noted, not defended against.
-- ===========================================================================

create table public.audit_log (
  id          bigint generated always as identity primary key,
  wedding_id  uuid        not null,
  at          timestamptz not null default now(),
  actor_id    uuid,
  actor_kind  text        not null check (actor_kind in ('planner', 'public')),
  table_name  text        not null,
  -- The primary key of the row, as {column: value}. Not a single uuid because
  -- the join tables (guest_tags, invitation_events, ...) have composite keys.
  row_key     jsonb       not null,
  -- A human-readable name for the row at the time (a guest's name, a list
  -- title), or null for tables with nothing to call a row.
  label       text,
  action      text        not null check (action in ('insert', 'update', 'delete')),
  changed     jsonb       not null,
  -- actor_id has a value exactly when a planner made the change.
  constraint audit_log_actor_matches_kind check ((actor_kind = 'planner') = (actor_id is not null))
);

create index audit_log_wedding_at_idx on public.audit_log (wedding_id, at desc, id desc);
create index audit_log_wedding_table_idx on public.audit_log (wedding_id, table_name, at desc);
-- Retention scans by age across weddings.
create index audit_log_at_idx on public.audit_log (at);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
-- RLS is enabled but NOT forced: the trigger function below is SECURITY
-- DEFINER and writes as the table's owner, and FORCE would subject that insert
-- to a policy there is deliberately no way to satisfy. There is no insert /
-- update / delete policy, so no authenticated session can write at all.
alter table public.audit_log enable row level security;

create policy audit_log_collaborator_read on public.audit_log
  for select to authenticated using (public.is_collaborator(wedding_id));

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
revoke all on sequence public.audit_log_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------------------
create or replace function public.audit_log_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  -- prune_audit_log() sets this for its own transaction only.
  if current_setting('app.audit_prune', true) = 'on' and tg_op = 'DELETE' then
    return old;
  end if;
  raise exception 'audit_log is append-only (% refused)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

-- ---------------------------------------------------------------------------
-- The writer
-- ---------------------------------------------------------------------------
-- Trigger arguments (all comma-separated column lists, all literals set below):
--   0  the primary key column(s)             — becomes row_key
--   1  columns whose values are redacted     — '' for none
--   2  columns that make up the row's label  — '' for none
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_key_cols   text[] := string_to_array(tg_argv[0], ',');
  v_redact     text[] := case when coalesce(tg_argv[1], '') = '' then '{}'::text[]
                              else string_to_array(tg_argv[1], ',') end;
  v_label_cols text[] := case when coalesce(tg_argv[2], '') = '' then '{}'::text[]
                              else string_to_array(tg_argv[2], ',') end;
  v_old        jsonb;
  v_new        jsonb;
  v_row        jsonb;
  v_changed    jsonb;
  v_wedding    uuid;
  v_label      text;
  v_col        text;
  v_uid        uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    v_row := to_jsonb(new);
    v_changed := v_row;
  elsif tg_op = 'DELETE' then
    v_row := to_jsonb(old);
    v_changed := v_row;
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_row := v_new;

    select coalesce(jsonb_object_agg(n.key, jsonb_build_array(v_old -> n.key, n.value)), '{}'::jsonb)
      into v_changed
      from jsonb_each(v_new) n
     where n.key <> 'updated_at'
       and (v_old -> n.key) is distinct from n.value;

    -- Nothing changed, or nothing but ordering churn (Q5): write no row.
    if not exists (
      select 1 from jsonb_object_keys(v_changed) k where k not in ('rank', 'sort_order')
    ) then
      return null;
    end if;
  end if;

  v_wedding := (v_row ->> case when tg_table_name = 'weddings' then 'id' else 'wedding_id' end)::uuid;
  if v_wedding is null then
    return null;
  end if;

  foreach v_col in array v_redact loop
    if v_changed ? v_col then
      v_changed := jsonb_set(v_changed, array[v_col], '"[redacted]"'::jsonb);
    end if;
  end loop;

  select nullif(btrim(string_agg(v_row ->> c, ' ' order by o)), '')
    into v_label
    from unnest(v_label_cols) with ordinality as t(c, o)
   where v_row ->> c is not null;

  insert into public.audit_log
    (wedding_id, actor_id, actor_kind, table_name, row_key, label, action, changed)
  values (
    v_wedding,
    v_uid,
    case when v_uid is null then 'public' else 'planner' end,
    tg_table_name,
    (select coalesce(jsonb_object_agg(k, v_row -> k), '{}'::jsonb) from unnest(v_key_cols) k),
    v_label,
    lower(tg_op),
    v_changed
  );

  return null;
end;
$$;

revoke all on function public.audit_row() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Which tables, and how
-- ---------------------------------------------------------------------------
-- Adding a table to the audit is one line here (or one create trigger in the
-- migration that adds the table). Each entry is
--   table | primary key | redacted columns | label columns
do $$
declare
  spec text;
  parts text[];
  audited constant text[] := array[
    -- the wedding, the people, the days
    'weddings|id||name',
    'collaborators|id||display_name',
    'events|id||name',
    -- guests
    'households|id||display_name',
    'guests|id||first_name,last_name',
    'tags|id||name',
    'guest_tags|guest_id,tag_id||',
    'guest_notes|id||author_name',
    'guest_event_overrides|guest_id,event_id||',
    'cut_lines|id||label',
    -- invitations and answers
    'invitations|id|token_hash,token_encrypted|',
    'invitation_events|invitation_id,event_id||',
    'rsvps|id||',
    'rsvp_questions|id||label',
    'rsvp_answers|id||',
    -- lists, run sheet
    'lists|id||title',
    'list_sections|id||title',
    'list_items|id||title',
    'run_sheet_items|id||title',
    'saved_views|id||name',
    -- budget
    'budget_categories|id||name',
    'budget_items|id||label',
    'consumption_components|id||label',
    'payments|id||',
    'budget_item_lists|budget_item_id,list_id||',
    'budget_item_sections|budget_item_id,section_id||',
    'budget_item_tasks|budget_item_id,list_item_id||',
    -- moodboards (the share link token is a credential: redacted)
    'moodboards|id||title',
    'moodboard_items|id||caption',
    'moodboard_shares|id|token_hash,token_encrypted|label',
    -- vendors and gifts
    'vendor_categories|id||name',
    'vendors|id||name',
    'vendor_contacts|id||name',
    'vendor_notes|id||',
    'gift_funds|id||name',
    'gift_bank_details|wedding_id|account_name,account_number,message,note|',
    -- travel and stay
    'transport_options|id||name',
    'coach_runs|id||label',
    'coach_stops|id||name',
    'coach_seats|id||',
    'accommodations|id||name',
    'arrival_points|id||name',
    -- the public site
    'site_content|id||block_key',
    'site_blocks|id||',
    'site_assets|id||',
    'dress_codes|id||name',
    'dress_code_notes|id||label',
    'song_requests|id||title',
    'song_votes|id||'
  ];
begin
  foreach spec in array audited loop
    parts := string_to_array(spec, '|');
    execute format(
      'create trigger audit_row after insert or update or delete on public.%I '
      'for each row execute function public.audit_row(%L, %L, %L)',
      parts[1], parts[2], parts[3], parts[4]
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------
-- Called weekly by /api/cron/audit-prune (service role). Returns how many rows
-- went. The flag is transaction-local, so it cannot leak to another call.
create or replace function public.prune_audit_log(p_keep_days integer default 365)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted bigint;
begin
  if p_keep_days < 30 then
    raise exception 'refusing to keep less than 30 days of audit history';
  end if;
  perform set_config('app.audit_prune', 'on', true);
  delete from public.audit_log where at < now() - make_interval(days => p_keep_days);
  get diagnostics v_deleted = row_count;
  perform set_config('app.audit_prune', 'off', true);
  return v_deleted;
end;
$$;

revoke all on function public.prune_audit_log(integer) from public, anon, authenticated;
grant execute on function public.prune_audit_log(integer) to service_role;
