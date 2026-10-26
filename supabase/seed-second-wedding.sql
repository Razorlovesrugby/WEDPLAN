do $$
declare
  v_wedding_name  text    := 'Our Wedding';
  v_wedding_date  date    := null;
  v_timezone      text    := 'Pacific/Auckland';
  v_capacity      integer := null;
  v_owner_email   text    := 'o.j.adam88@gmail.com';
  v_partner_email text    := 'swany0612@gmail.com';
  v_password      text    := 'WEDPLAN';

  v_wedding_id uuid;
  v_owner_id   uuid;
  v_partner_id uuid;
  v_email      text;
  v_uid        uuid;
begin
  foreach v_email in array array[v_owner_email, v_partner_email] loop
    select id into v_uid from auth.users where lower(email) = lower(v_email);

    if v_uid is null then
      v_uid := gen_random_uuid();

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new
      ) values (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
        v_email, crypt(v_password, gen_salt('bf')),
        now(), '{"provider":"email","providers":["email"]}', '{}',
        now(), now(),
        '', '', '', ''
      );

      insert into auth.identities (
        id, user_id, provider_id, provider, identity_data,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_uid, v_uid::text, 'email',
        jsonb_build_object('sub', v_uid::text, 'email', v_email,
                           'email_verified', true, 'phone_verified', false),
        now(), now(), now()
      );
    end if;

    if lower(v_email) = lower(v_owner_email) then
      v_owner_id := v_uid;
    else
      v_partner_id := v_uid;
    end if;
    v_uid := null;
  end loop;

  insert into public.weddings (name, wedding_date, timezone, capacity)
  values (v_wedding_name, v_wedding_date, v_timezone, v_capacity)
  returning id into v_wedding_id;

  insert into public.collaborators (wedding_id, user_id, role) values
    (v_wedding_id, v_owner_id,   'owner'),
    (v_wedding_id, v_partner_id, 'partner');

  insert into public.events (wedding_id, name, is_public, sort_order) values
    (v_wedding_id, 'Ceremony',  true, 1),
    (v_wedding_id, 'Reception', true, 2);

  insert into public.rsvp_questions (wedding_id, label, type, scope, required, sort_order) values
    (v_wedding_id, 'Song request',               'short_text', 'guest',     false, 1),
    (v_wedding_id, 'Do you need transport?',     'boolean',    'household', false, 2),
    (v_wedding_id, 'Do you need accommodation?', 'boolean',    'household', false, 3),
    (v_wedding_id, 'Message to the couple',      'long_text',  'household', false, 4);

  raise notice 'Wedding "%" created (id %), %.', v_wedding_name, v_wedding_id, coalesce(v_wedding_date::text, 'no date set');
end;
$$;
