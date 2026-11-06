-- ===========================================================================
-- Bootstrap: create your wedding and attach yourselves to it
-- ===========================================================================
-- Run this after all migrations (0045 at least), in the Supabase SQL editor.
--
-- Why this is a script and not a screen: `weddings` has no INSERT policy,
-- deliberately (a collaborator inserting a bare wedding row would lose sight
-- of it the instant it existed). Since spec 40 a couple can also sign
-- themselves up at /start; both paths go through the same function,
-- public.create_wedding() (migration 0045), so they make identical weddings.
-- The SQL editor runs with privileges the app never has, which is what lets
-- this script call it.
--
-- Run it once per couple. It refuses if either login already has a wedding.
--
-- ---------------------------------------------------------------------------
-- BEFORE YOU RUN THIS
-- ---------------------------------------------------------------------------
-- Both people must already exist as users, because sign-up is disabled and
-- sign-in is by email and password. In the dashboard:
--
--     Authentication → Users → Add user
--
-- Set a password for each user there directly (or tick "Auto Confirm User"
-- and use the app's own /forgot-password flow afterwards to set one by
-- email). Do that for both addresses, then come back here.
--
-- ---------------------------------------------------------------------------
-- EDIT THESE VALUES, then run the whole file.
-- ---------------------------------------------------------------------------
do $$
declare
  -- Your details ------------------------------------------------------------
  v_wedding_name  text := 'Alex & Sam';              -- as it appears in the app
  v_wedding_date  date := '2027-06-12';              -- null if not fixed yet
  v_owner_email   text := 'you@example.com';         -- must already be a user
  v_partner_email text := 'them@example.com';        -- null for a single user
  v_timezone      text := 'Pacific/Auckland';        -- the VENUE's timezone
  v_currency      text := 'NZD';                     -- a symbol only; never converts
  v_capacity      integer := 90;                     -- seats; null if unknown
  v_owner_name    text := null;                      -- your name in the app, optional
  v_partner_name  text := null;                      -- theirs, optional
  -- -------------------------------------------------------------------------

  v_wedding_id  uuid;
  v_owner_id    uuid;
  v_partner_id  uuid;
begin
  select id into v_owner_id from auth.users where lower(email) = lower(v_owner_email);
  if v_owner_id is null then
    raise exception
      'No user with email %. Invite them under Authentication → Users first.',
      v_owner_email;
  end if;

  if v_partner_email is not null then
    select id into v_partner_id from auth.users where lower(email) = lower(v_partner_email);
    if v_partner_id is null then
      raise exception
        'No user with email %. Invite them first, or set v_partner_email to null.',
        v_partner_email;
    end if;
  end if;

  v_wedding_id := public.create_wedding(
    v_owner_id, v_partner_id, v_wedding_name, v_wedding_date,
    v_timezone, v_currency, v_capacity, v_owner_name, v_partner_name);

  raise notice 'Wedding "%" created (id %).', v_wedding_name, v_wedding_id;
  raise notice 'Collaborators attached: %.', coalesce(v_partner_email, '') || ' ' || v_owner_email;
  raise notice 'Sign in at /login with % and you should see an empty dashboard. The site builder offers starter layouts on first open.', v_owner_email;
end;
$$;
