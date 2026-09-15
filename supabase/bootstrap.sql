-- ===========================================================================
-- Bootstrap: create your wedding and attach yourselves to it
-- ===========================================================================
-- Run this ONCE, after migrations 0001–0003, in the Supabase SQL editor.
--
-- Why this is a script and not a screen in the app: `weddings` has no INSERT
-- policy, deliberately. A collaborator inserting a bare wedding row would lose
-- access to it the instant it existed, because is_collaborator() would be
-- false for the row they had just created. So the first wedding is created
-- here, where the SQL editor runs with privileges the app never has.
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
-- EDIT THESE FOUR VALUES, then run the whole file.
-- ---------------------------------------------------------------------------
do $$
declare
  -- Your details ------------------------------------------------------------
  v_wedding_name  text := 'Alex & Sam';              -- as it appears in the app
  v_wedding_date  date := '2027-06-12';              -- null if not fixed yet
  v_owner_email   text := 'you@example.com';         -- must already be a user
  v_partner_email text := 'them@example.com';        -- null for a single user
  v_timezone      text := 'Europe/London';           -- the VENUE's timezone
  v_currency      char(3) := 'GBP';
  v_capacity      integer := 90;                     -- seats; null if unknown
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

  if exists (select 1 from public.weddings) then
    raise exception
      'A wedding already exists. This script is for the first one only — '
      'delete the existing row first if you are starting over.';
  end if;

  insert into public.weddings (name, wedding_date, timezone, base_currency, capacity)
  values (v_wedding_name, v_wedding_date, v_timezone, v_currency, v_capacity)
  returning id into v_wedding_id;

  insert into public.collaborators (wedding_id, user_id, role)
  values (v_wedding_id, v_owner_id, 'owner');

  if v_partner_id is not null then
    insert into public.collaborators (wedding_id, user_id, role)
    values (v_wedding_id, v_partner_id, 'partner');
  end if;

  -- A ceremony and a reception, because almost every wedding has both and an
  -- invitation needs at least one event to point at. Rename or delete them on
  -- the events screen.
  insert into public.events (wedding_id, name, is_public, sort_order) values
    (v_wedding_id, 'Ceremony',  true, 1),
    (v_wedding_id, 'Reception', true, 2);

  -- The standard question set from the spec. Edit or remove on /guests once
  -- the question builder exists; until then, change them here.
  insert into public.rsvp_questions (wedding_id, label, type, scope, required, sort_order) values
    (v_wedding_id, 'Song request',               'short_text', 'guest',     false, 1),
    (v_wedding_id, 'Do you need transport?',     'boolean',    'household', false, 2),
    (v_wedding_id, 'Do you need accommodation?', 'boolean',    'household', false, 3),
    (v_wedding_id, 'Message to the couple',      'long_text',  'household', false, 4);

  -- Dietary and accessibility are asked on every RSVP form already, as fields
  -- on the guest rather than custom questions, so they are not repeated here.

  insert into public.site_content (wedding_id, block_key, payload, sort_order) values
    (v_wedding_id, 'hero',
     jsonb_build_object('headline', v_wedding_name, 'date_label',
       coalesce(to_char(v_wedding_date, 'DD Month YYYY'), 'Date to be confirmed')), 1),
    (v_wedding_id, 'schedule', '{"intro": ""}'::jsonb, 2),
    (v_wedding_id, 'travel',   '{"body": ""}'::jsonb,  3),
    (v_wedding_id, 'faq',      '{"items": []}'::jsonb, 4);

  raise notice 'Wedding "%" created (id %).', v_wedding_name, v_wedding_id;
  raise notice 'Collaborators attached: %.', coalesce(v_partner_email, '') || ' ' || v_owner_email;
  raise notice 'Sign in at /login with % and you should see an empty dashboard.', v_owner_email;
end;
$$;
