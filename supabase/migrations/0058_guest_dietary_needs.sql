-- 0058_guest_dietary_needs.sql  (spec 57 Part H)
--
-- Structured dietary needs beside the free-text `guests.dietary`, which is
-- left exactly as it is (nothing reads it into tags). Guest data: it follows
-- the guest's soft delete, and is never hard-deleted by the app.

create table public.guest_dietary_needs (
  wedding_id  uuid not null,
  guest_id    uuid not null,
  tag         text not null check (tag in (
    'vegetarian', 'vegan', 'gluten_free', 'dairy_free', 'nut', 'peanut', 'shellfish',
    'fish', 'egg', 'soy', 'sesame', 'halal', 'kosher', 'other')),
  -- A short text, and only for `other`.
  other_text  text check (other_text is null or (other_text <> '' and length(other_text) <= 60)),
  -- An allergy needs care; a preference is a wish.
  is_allergy  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (guest_id, tag),
  foreign key (guest_id, wedding_id) references public.guests (id, wedding_id) on delete cascade,
  check ((tag = 'other') = (other_text is not null))
);
create index guest_dietary_needs_wedding_idx on public.guest_dietary_needs (wedding_id);
create trigger guest_dietary_needs_touch before update on public.guest_dietary_needs
  for each row execute function public.touch_updated_at();

alter table public.guest_dietary_needs enable row level security;
alter table public.guest_dietary_needs force row level security;
create policy guest_dietary_needs_collaborator on public.guest_dietary_needs for all to authenticated
  using (public.is_collaborator(wedding_id)) with check (public.is_collaborator(wedding_id));
revoke all on public.guest_dietary_needs from anon;

-- The planner reads guests, dietary notes included (spec 39 Q3), and so these.
insert into public.planner_table_access (table_name, access, note)
values ('guest_dietary_needs', 'read', 'with the dietary note it sits beside (spec 39 Q3)');
create policy guest_dietary_needs_planner_read on public.guest_dietary_needs for select to authenticated
  using (public.can_plan(wedding_id));

create trigger audit_row after insert or update or delete on public.guest_dietary_needs
  for each row execute function public.audit_row('guest_id,tag', '', 'tag');
