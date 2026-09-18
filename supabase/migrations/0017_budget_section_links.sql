-- ===========================================================================
-- 0017: Budget links at the section grain
-- ===========================================================================
-- Spec 6, section 7 built two link grains (a whole list, an individual
-- task) and explicitly scoped this third one out as "a natural later
-- addition if it turns out to matter" (docs/specs/16-list-appearance-sidebar-and-budget-section-links.md,
-- section 3). Same shape as budget_item_tasks/budget_item_lists (0010).
-- ===========================================================================

create table public.budget_item_sections (
  wedding_id      uuid not null,
  budget_item_id  uuid not null,
  section_id      uuid not null,
  created_at      timestamptz not null default now(),
  primary key (budget_item_id, section_id),
  foreign key (budget_item_id, wedding_id)
    references public.budget_items (id, wedding_id) on delete cascade,
  foreign key (section_id, wedding_id)
    references public.list_sections (id, wedding_id) on delete cascade
);
create index budget_item_sections_section_idx on public.budget_item_sections (section_id);

alter table public.budget_item_sections enable row level security;
alter table public.budget_item_sections force row level security;
create policy budget_item_sections_collaborator on public.budget_item_sections
  for all to authenticated
  using (public.is_collaborator(wedding_id))
  with check (public.is_collaborator(wedding_id));
revoke all on public.budget_item_sections from anon;

-- ---------------------------------------------------------------------------
-- v_budget_item_tasks -- gains a third source. `linked_via_list boolean`
-- (0010) becomes `link_source text` (direct | via_list | via_section) so the
-- "Linked tasks" popup can still tell all three apart in one column; a task
-- linked more than one way keeps only its most specific source, ranked
-- direct > via_list > via_section (min(priority), same idea 0010's
-- bool_and(linked_via_list) already used to make "direct" win over
-- "via_list" whenever both were true for the same row).
-- ---------------------------------------------------------------------------
-- Renaming a column isn't an additive change CREATE OR REPLACE VIEW allows
-- (Postgres: "cannot change name of view column") — drop and recreate
-- rather than ALTER VIEW ... RENAME COLUMN, so the grants below stay the
-- single source of truth for who can read it, applied fresh either way.
drop view public.v_budget_item_tasks;

create view public.v_budget_item_tasks
with (security_invoker = true) as
select
  x.budget_item_id,
  li.id as list_item_id,
  li.list_id,
  l.title as list_title,
  li.title,
  li.notes,
  li.due_date,
  li.status,
  li.done_at,
  case min(x.priority)
    when 1 then 'direct'
    when 2 then 'via_list'
    else 'via_section'
  end as link_source
from (
  select budget_item_id, list_item_id, 1 as priority
  from public.budget_item_tasks
  union all
  select bil.budget_item_id, li2.id as list_item_id, 2 as priority
  from public.budget_item_lists bil
  join public.list_items li2 on li2.list_id = bil.list_id and li2.wedding_id = bil.wedding_id
  union all
  select bis.budget_item_id, li3.id as list_item_id, 3 as priority
  from public.budget_item_sections bis
  join public.list_items li3 on li3.section_id = bis.section_id and li3.wedding_id = bis.wedding_id
) x
join public.list_items li on li.id = x.list_item_id
join public.lists l on l.id = li.list_id and l.wedding_id = li.wedding_id
group by x.budget_item_id, li.id, li.list_id, l.title, li.title, li.notes, li.due_date, li.status, li.done_at;

revoke all on public.v_budget_item_tasks from anon;
grant select on public.v_budget_item_tasks to authenticated;

-- ---------------------------------------------------------------------------
-- Spec 16, section 2: a list is either a color or an emoji, never both, on
-- /calendar and /timeline's cards too — which need the icon to make that
-- swap, and never selected it before now. v_timeline_items (0005) is
-- replaced, not edited (same "additive column at the end" rule 0005 itself
-- already followed against 0004) — every existing column keeps its position.
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
  li.assigned_to,
  l.icon as list_icon
from public.list_items li
join public.lists l on l.id = li.list_id and l.wedding_id = li.wedding_id
where li.due_date is not null
  and l.archived_at is null;
