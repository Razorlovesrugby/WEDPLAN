-- ===========================================================================
-- Row Level Security
-- ===========================================================================
-- Threat model for V1
-- ---------------------------------------------------------------------------
-- Three principals reach this database:
--
--   authenticated  the two collaborators, via magic link. May read and write
--                  everything belonging to a wedding they collaborate on, and
--                  nothing else. This is what the policies below express.
--
--   anon           the publishable key, shipped to the browser. Granted
--                  NOTHING. The public RSVP page and the public site are
--                  rendered server-side; no browser ever talks to PostgREST
--                  without a session. Revoked explicitly rather than left to
--                  RLS, so a policy mistake is not instantly an exposure.
--
--   service_role   server-only, bypasses RLS. Used by exactly two code paths:
--                  the public RSVP flow (src/lib/supabase/admin.ts) and the
--                  cron sender. Every one of those call sites is responsible
--                  for its own scoping — a token grants access to its own
--                  household and nothing else.
--
-- Policies are generated in a loop so that a table cannot be added to the
-- tenant set and quietly miss its policy. Adding a table to the array is the
-- entire cost of securing it.
-- ===========================================================================

-- Security definer so the function itself is not subject to RLS on
-- collaborators — otherwise the policy on collaborators would recurse into
-- itself. search_path is pinned: a security definer function without a pinned
-- search_path is a privilege escalation waiting to happen.
create or replace function public.is_collaborator(p_wedding_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.collaborators c
    where c.wedding_id = p_wedding_id
      and c.user_id = auth.uid()
  );
$$;

revoke all on function public.is_collaborator(uuid) from public, anon;
grant execute on function public.is_collaborator(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- weddings: keyed on id, not wedding_id
-- ---------------------------------------------------------------------------
alter table public.weddings enable row level security;
alter table public.weddings force row level security;

create policy weddings_select on public.weddings
  for select to authenticated using (public.is_collaborator(id));

-- Deliberately no insert policy: a wedding is created by the service role,
-- which also writes the owner's collaborators row in the same transaction.
-- An authenticated user creating a bare wedding row would lock themselves out
-- of it, because is_collaborator() would be false for the row they just made.
create policy weddings_update on public.weddings
  for update to authenticated
  using (public.is_collaborator(id))
  with check (public.is_collaborator(id));

-- ---------------------------------------------------------------------------
-- Tenant tables: one uniform policy each
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tenant_tables constant text[] := array[
    'collaborators',
    'events',
    'households',
    'guests',
    'tags',
    'guest_tags',
    'invitations',
    'invitation_events',
    'rsvps',
    'rsvp_questions',
    'rsvp_answers',
    'message_log',
    'site_content',
    'saved_views'
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

-- saved_views are per-collaborator, not per-wedding: narrow the policy so one
-- partner does not rewrite the other's saved filters.
drop policy saved_views_collaborator on public.saved_views;
create policy saved_views_own on public.saved_views
  for all to authenticated
  using (public.is_collaborator(wedding_id) and user_id = auth.uid())
  with check (public.is_collaborator(wedding_id) and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Infrastructure tables: no policy at all, so only service_role reaches them
-- ---------------------------------------------------------------------------
alter table public.rsvp_token_attempts enable row level security;
alter table public.rsvp_token_attempts force row level security;
revoke all on public.rsvp_token_attempts from anon, authenticated;

revoke all on public.weddings from anon;
revoke all on all sequences in schema public from anon;
