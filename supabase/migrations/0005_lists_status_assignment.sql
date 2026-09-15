-- ===========================================================================
-- 0005: status, sub-items, recurrence, assignment
-- ===========================================================================
-- The schema deltas spec 1 (section 5a) needed once its open questions were
-- answered "yes" across the board: board view, one level of sub-items,
-- recurrence, per-person assignment. All additive on top of `0004_lists.sql`
-- -- that file is applied and frozen, so this one only adds columns,
-- constraints, indexes and triggers, and replaces `v_timeline_items` (a view,
-- not a table, so CREATE OR REPLACE is not "editing 0004").
-- ===========================================================================

create type list_item_status as enum ('not_started', 'in_progress', 'done');

alter table public.list_items
  add column status              list_item_status not null default 'not_started',
  add column parent_item_id      uuid,
  add column repeat_rule         jsonb,
  add column recurrence_parent_id uuid,
  add column assigned_to         uuid references auth.users (id) on delete set null;

-- Backfill for any row inserted before this migration (0004 shipped with no
-- seed rows of its own, so this is a no-op today, but the rule is the same
-- one every other status/timestamp pair in this schema follows).
update public.list_items set status = 'done' where done_at is not null;

alter table public.list_items
  add constraint list_items_parent_fk
    foreign key (parent_item_id, wedding_id)
    references public.list_items (id, wedding_id) on delete cascade,
  add constraint list_items_recurrence_fk
    foreign key (recurrence_parent_id, wedding_id)
    references public.list_items (id, wedding_id) on delete set null (recurrence_parent_id),
  add constraint list_items_parent_not_self
    check (parent_item_id is null or parent_item_id <> id),
  add constraint list_items_recurrence_not_self
    check (recurrence_parent_id is null or recurrence_parent_id <> id),
  -- done_at is the completion timestamp; keep it in lockstep with status
  -- rather than letting the two drift, the same way sent_at/responded_at
  -- track their own boolean-shaped state elsewhere in this schema.
  add constraint list_items_status_done_at
    check ((status = 'done') = (done_at is not null)),
  add constraint list_items_repeat_rule_shape
    check (repeat_rule is null or jsonb_typeof(repeat_rule) = 'object');

create index list_items_status_idx on public.list_items (wedding_id, status);
create index list_items_parent_idx
  on public.list_items (parent_item_id) where parent_item_id is not null;
create index list_items_recurrence_idx
  on public.list_items (recurrence_parent_id) where recurrence_parent_id is not null;
create index list_items_assigned_idx
  on public.list_items (wedding_id, assigned_to) where assigned_to is not null;

-- ---------------------------------------------------------------------------
-- One level of sub-items, enforced in the database rather than trusted to the
-- application: a row that already has children cannot become a child itself,
-- and a row cannot be parented to a row that is itself a child.
-- ---------------------------------------------------------------------------
create or replace function public.list_items_enforce_one_level()
returns trigger
language plpgsql
as $$
declare
  grandparent uuid;
  child_count int;
begin
  if new.parent_item_id is null then
    return new;
  end if;
  if new.parent_item_id = new.id then
    raise exception 'a list item cannot be its own parent';
  end if;

  select parent_item_id into grandparent
    from public.list_items
    where id = new.parent_item_id and wedding_id = new.wedding_id;
  if grandparent is not null then
    raise exception 'sub-items may not themselves have sub-items (one level of nesting only)';
  end if;

  select count(*) into child_count
    from public.list_items
    where parent_item_id = new.id and wedding_id = new.wedding_id;
  if child_count > 0 then
    raise exception 'an item with sub-items cannot itself become a sub-item';
  end if;

  return new;
end;
$$;

create trigger list_items_one_level_nesting
  before insert or update of parent_item_id on public.list_items
  for each row execute function public.list_items_enforce_one_level();

-- ---------------------------------------------------------------------------
-- Parent status auto-derivation.
--
-- "A parent item with sub-items moves to in_progress the moment any sub-item
-- is done while at least one remains not-done, and back to not_started if all
-- its sub-items become not-done again. A direct manual status set on the
-- parent always wins over the derived value until its sub-item completion
-- state next changes." (spec 1, section 5a)
--
-- That last sentence is why this unconditionally overwrites the parent's
-- current status (even 'done', even a value a human just set) whenever a
-- child's completion changes: the override is defined to last only until the
-- next such change, and this trigger IS that change. The one case this never
-- touches is every sub-item done -- moving the parent to 'done' stays a
-- manual action, deliberately, per the spec.
-- ---------------------------------------------------------------------------
create or replace function public.list_items_recompute_parent(p_parent_id uuid, p_wedding_id uuid)
returns void
language plpgsql
as $$
declare
  total_count int;
  done_count  int;
begin
  if p_parent_id is null then
    return;
  end if;

  select count(*), count(*) filter (where status = 'done')
    into total_count, done_count
    from public.list_items
    where parent_item_id = p_parent_id and wedding_id = p_wedding_id;

  if total_count = 0 then
    return;
  elsif done_count = 0 then
    update public.list_items set status = 'not_started', done_at = null
      where id = p_parent_id and wedding_id = p_wedding_id and status <> 'not_started';
  elsif done_count < total_count then
    update public.list_items set status = 'in_progress', done_at = null
      where id = p_parent_id and wedding_id = p_wedding_id and status <> 'in_progress';
  end if;
  -- done_count = total_count: every sub-item done. No automatic transition.
end;
$$;

create or replace function public.list_items_derive_parent_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.list_items_recompute_parent(old.parent_item_id, old.wedding_id);
    return old;
  end if;

  perform public.list_items_recompute_parent(new.parent_item_id, new.wedding_id);
  if tg_op = 'UPDATE' and old.parent_item_id is distinct from new.parent_item_id then
    perform public.list_items_recompute_parent(old.parent_item_id, old.wedding_id);
  end if;
  return new;
end;
$$;

create trigger list_items_parent_status
  after insert or update of status, parent_item_id or delete on public.list_items
  for each row execute function public.list_items_derive_parent_status();

-- ---------------------------------------------------------------------------
-- v_timeline_items -- replaced, not edited in 0004: a view carries no data of
-- its own, so redefining it here is additive in the same sense a new column
-- is. CREATE OR REPLACE VIEW can only append columns, never reorder or
-- insert among existing ones (Postgres refuses "cannot change name of view
-- column"), so status/parent_item_id/assigned_to are added at the end,
-- keeping every 0004 column in its original position.
-- ---------------------------------------------------------------------------
create or replace view public.v_timeline_items
with (security_invoker = true) as
select
  li.id,
  li.wedding_id,
  li.list_id,
  l.title as list_title,
  l.color as list_color,
  l.kind as list_kind,
  l.event_id,
  li.section_id,
  li.title,
  li.notes,
  li.due_date,
  li.done_at,
  li.flagged,
  li.priority,
  li.snoozed_until,
  li.created_at,
  li.updated_at,
  li.status,
  li.parent_item_id,
  li.assigned_to
from public.list_items li
join public.lists l on l.id = li.list_id and l.wedding_id = li.wedding_id
where li.due_date is not null
  and l.archived_at is null;
