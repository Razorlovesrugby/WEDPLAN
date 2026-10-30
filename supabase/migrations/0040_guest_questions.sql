-- 0040_guest_questions.sql
--
-- "Ask a question" under the FAQ on the wedding site: a guest types a question
-- and it lands in the couple's inbox. Unlike `guest_notes` nothing here is ever
-- shown to other guests, so there is no moderation queue and no 'approved'
-- rung: new -> answered | dismissed.
--
-- `household_id` is set when the question was sent from a household's own page
-- (the reader holds that household's credential), null from the shared address,
-- mirroring guest_notes. `contact` is whatever the guest typed so the couple
-- can reply; it is optional and redacted in the audit log.
--
-- 1000 characters, checked here as well as in the form.
create table public.guest_questions (
  id           uuid primary key default gen_random_uuid(),
  wedding_id   uuid not null references public.weddings (id) on delete cascade,
  household_id uuid,
  author_name  text,
  contact      text,
  body         text not null,
  status       text not null default 'new',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (household_id, wedding_id)
    references public.households (id, wedding_id) on delete set null (household_id),
  check (body <> ''),
  check (char_length(body) <= 1000),
  check (contact is null or char_length(contact) <= 200),
  check (status in ('new', 'answered', 'dismissed'))
);
create index guest_questions_wedding_idx
  on public.guest_questions (wedding_id, status, created_at desc);
create trigger guest_questions_touch before update on public.guest_questions
  for each row execute function public.touch_updated_at();

-- RLS: same shape as every tenant table. Guests write through the service
-- role (the server action scopes itself by wedding); `anon` is revoked so a
-- leaked publishable key can read nobody's questions.
alter table public.guest_questions enable row level security;
alter table public.guest_questions force row level security;
create policy guest_questions_collaborator on public.guest_questions
  for all to authenticated
  using (public.is_collaborator(wedding_id))
  with check (public.is_collaborator(wedding_id));
revoke all on public.guest_questions from anon;

create trigger audit_row after insert or update or delete on public.guest_questions
  for each row execute function public.audit_row('id', 'contact', 'author_name');
