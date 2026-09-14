-- ===========================================================================
-- Minimal Supabase shim for verifying migrations against plain PostgreSQL
-- ===========================================================================
-- Supabase provides auth.users, the auth.uid() helper and the anon /
-- authenticated / service_role roles. A bare Postgres cluster does not, so
-- the migrations would fail to apply outside Supabase and CI could not check
-- them. This file supplies just enough of that surface to apply the
-- migrations and exercise RLS.
--
-- It is a TEST FIXTURE. It is never applied to a real project — the real
-- objects come from Supabase itself.
-- ===========================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Supabase derives the current user from the request JWT. Locally we stand in
-- a GUC that tests set with set_config('request.jwt.claim.sub', ...).
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase's default privileges hand new tables to anon and authenticated;
-- reproduce that so the migrations' explicit REVOKEs are actually testing
-- something rather than revoking a grant that was never made.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
