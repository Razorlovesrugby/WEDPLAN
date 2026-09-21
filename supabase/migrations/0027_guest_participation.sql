-- ===========================================================================
-- 0027_guest_participation.sql — spec 25, Part B
--
-- Two things spec 23 deliberately cut, reopened on one rule.
--
-- Spec 23 cut the guestbook ("a moderation surface") and kept the song list
-- planner-facing ("nothing a guest types is rendered back onto the public
-- page"). Both cuts had the same reason: somebody has to read what strangers
-- write, in the weeks before a wedding, and that somebody is the couple.
--
-- THE RULE THAT MAKES THEM AFFORDABLE (spec 25 §10, Answered question 3):
-- spec 21 minted `households.slug_suffix` as a credential — five random
-- characters, never changed by a rename, redrawn only by reissueInvitation.
-- Somebody reading /w/ray-and-olivia/okonkwo-4f7ak HOLDS AN INVITATION.
-- Somebody on /w/ray-and-olivia is the internet.
--
--   A contribution carrying a household  ->  published immediately
--   A contribution from the shared page  ->  status 'new', waits
--
-- So the review queue only ever holds submissions from people who found the
-- public address, which is exactly the set worth looking at, and the common
-- case — a guest who was sent a link and used it — costs nobody an evening.
--
-- That rule lives in ONE application function (`canPublishImmediately`) that
-- both write paths call, because two copies of it is how one of them quietly
-- stops gating. What this file does is make the rule expressible: the status
-- ladder, and a votes table that CANNOT record an anonymous vote.
--
-- No new enum (status is text + check, matching song_requests), so no 55P04
-- split.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- song_requests gains the composite unique it needs to be a parent
-- ---------------------------------------------------------------------------
-- 0025 created it without `unique (id, wedding_id)` because nothing pointed at
-- it. song_votes does, and the tenancy rule (docs/HANDOFF.md section 5, rule 1)
-- wants the child FK on (parent_id, wedding_id) so a row cannot be adopted
-- across weddings.
alter table public.song_requests
  add constraint song_requests_id_wedding_key unique (id, wedding_id);

-- ---------------------------------------------------------------------------
-- song_votes
-- ---------------------------------------------------------------------------
-- `household_id` IS NOT NULL, and that is the whole design.
--
-- Spec 25 Answered question 4: anyone with the site address can SUGGEST a
-- song; voting needs a household link. Without identity, "one vote each" is a
-- cookie, and a cookie is a suggestion — anybody who wants to stuff the ballot
-- opens a private window. Making the column NOT NULL puts that rule in the
-- database rather than in a code path somebody later "simplifies", which is
-- the difference between a constraint and an intention.
--
-- One row per household per song, by unique constraint. A household votes
-- together, exactly as it books coach seats together (0017's note on
-- coach_seats makes the same argument).
create table public.song_votes (
  id              uuid primary key default gen_random_uuid(),
  wedding_id      uuid not null references public.weddings (id) on delete cascade,
  song_request_id uuid not null,
  household_id    uuid not null,
  created_at      timestamptz not null default now(),
  unique (id, wedding_id),
  unique (song_request_id, household_id),
  foreign key (song_request_id, wedding_id)
    references public.song_requests (id, wedding_id) on delete cascade,
  foreign key (household_id, wedding_id)
    references public.households (id, wedding_id) on delete cascade
);
create index song_votes_request_idx on public.song_votes (song_request_id);

-- ---------------------------------------------------------------------------
-- guest_notes — the guestbook
-- ---------------------------------------------------------------------------
-- Nullable household and guest, mirroring song_requests: a note from a
-- personalised page is attributed automatically, one from the shared page
-- carries only whatever name was typed.
--
-- 500 characters, checked here rather than only in a form. It is a guestbook,
-- not a comment section, and the limit is most of what makes people write the
-- good version.
--
-- `status` has no 'played' — that rung is a song's. new -> approved | ignored.
create table public.guest_notes (
  id           uuid primary key default gen_random_uuid(),
  wedding_id   uuid not null references public.weddings (id) on delete cascade,
  household_id uuid,
  guest_id     uuid,
  author_name  text,
  body         text not null,
  status       text not null default 'new',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (household_id, wedding_id)
    references public.households (id, wedding_id) on delete set null (household_id),
  foreign key (guest_id, wedding_id)
    references public.guests (id, wedding_id) on delete set null (guest_id),
  check (body <> ''),
  check (char_length(body) <= 500),
  check (status in ('new', 'approved', 'ignored'))
);
create index guest_notes_wedding_idx
  on public.guest_notes (wedding_id, status, created_at desc);
create trigger guest_notes_touch before update on public.guest_notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Same shape as every tenant table. The public page reads approved rows
-- through the service role, which bypasses RLS and scopes itself by wedding;
-- `anon` is revoked here so a leaked publishable key cannot read the queue of
-- things nobody has approved yet.
do $$
declare
  t text;
begin
  foreach t in array array['song_votes', 'guest_notes'] loop
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
