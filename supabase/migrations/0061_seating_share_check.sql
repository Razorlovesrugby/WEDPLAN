-- 0061_seating_share_check.sql  (spec 57 E.3)
--
-- A share link is a view-only address to an event's live layout. The token is
-- shown once and only its hash is stored; an optional passcode is stored as a
-- hash the app derives from the token and the passcode. This function is what
-- the public page asks: is this link good, and for which event? It is
-- SECURITY DEFINER and callable only by the service role, so the answer comes
-- from the database and no one can read the table's hashes through it.
--
-- A wrong passcode counts: five in a row lock the link for fifteen minutes, so
-- a four-character passcode can't be guessed by trying them all.
--
-- Not edited: 0057.

alter table public.seating_share_links
  add column failed_attempts integer not null default 0,
  add column locked_until timestamptz;

create or replace function public.seating_share_check(p_token_hash text, p_passcode_hash text default null)
returns table (status text, event_id uuid, wedding_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  l public.seating_share_links;
begin
  select * into l from public.seating_share_links s where s.token_hash = p_token_hash;
  if l.id is null or l.revoked_at is not null or (l.expires_at is not null and l.expires_at <= now()) then
    return query select 'gone'::text, null::uuid, null::uuid;
    return;
  end if;
  if l.locked_until is not null and l.locked_until > now() then
    return query select 'locked'::text, null::uuid, null::uuid;
    return;
  end if;

  if l.passcode_hash is not null then
    if p_passcode_hash is null then
      return query select 'passcode_required'::text, null::uuid, null::uuid;
      return;
    end if;
    if p_passcode_hash <> l.passcode_hash then
      if l.failed_attempts + 1 >= 5 then
        update public.seating_share_links set failed_attempts = 0, locked_until = now() + interval '15 minutes' where id = l.id;
      else
        update public.seating_share_links set failed_attempts = failed_attempts + 1 where id = l.id;
      end if;
      return query select 'wrong_passcode'::text, null::uuid, null::uuid;
      return;
    end if;
    if l.failed_attempts <> 0 or l.locked_until is not null then
      update public.seating_share_links set failed_attempts = 0, locked_until = null where id = l.id;
    end if;
  end if;

  return query select 'ok'::text, l.event_id, l.wedding_id;
end;
$$;
revoke all on function public.seating_share_check(text, text) from public, anon, authenticated;
grant execute on function public.seating_share_check(text, text) to service_role;
