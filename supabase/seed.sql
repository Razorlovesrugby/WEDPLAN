-- ===========================================================================
-- Development seed
-- ===========================================================================
-- Two weddings, deliberately. The second one exists so that every RLS test
-- has something it must NOT be able to see — a tenancy test with a single
-- tenant proves nothing.
--
-- Dev only. `supabase db reset` applies this; production never does.
-- ===========================================================================

-- Auth users. On a real Supabase project auth.users is managed by GoTrue;
-- these rows are enough to attach collaborators and exercise RLS, but they
-- cannot sign in. Sign in for real with a magic link.
do $$
begin
  insert into auth.users (id, email) values
    ('aaaaaaaa-0000-4000-8000-000000000001', 'alex@example.test'),
    ('aaaaaaaa-0000-4000-8000-000000000002', 'sam@example.test'),
    ('cccccccc-0000-4000-8000-000000000003', 'stranger@example.test')
  on conflict (id) do nothing;
exception
  when others then
    raise notice 'skipping auth.users seed (%): attach collaborators manually', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Wedding 1 — the one under test
-- ---------------------------------------------------------------------------
insert into public.weddings
  (id, name, wedding_date, timezone, base_currency, capacity, rsvp_lock_at)
values
  ('11111111-1111-4111-8111-111111111111', 'Alex & Sam', '2027-06-12', 'Europe/London',
   'GBP', 90, '2027-04-30 23:59:00+01')
on conflict (id) do nothing;

-- Cut lines (spec 5, part A) — same effective A/a6, B/a8, C split the fixed
-- two-column version used to encode directly on `weddings`.
insert into public.cut_lines (id, wedding_id, label, position, boundary_rank) values
  ('c1111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-111111111111', 'A', 0, 'a6'),
  ('c1111111-1111-4111-8111-000000000002', '11111111-1111-4111-8111-111111111111', 'B', 1, 'a8'),
  ('c1111111-1111-4111-8111-000000000003', '11111111-1111-4111-8111-111111111111', 'C', 2, null)
on conflict (id) do nothing;

insert into public.collaborators (wedding_id, user_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'owner'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000002', 'partner')
on conflict do nothing;

insert into public.events (id, wedding_id, name, starts_at, venue, address, is_public, sort_order) values
  ('e1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   'Ceremony', '2027-06-12 13:00:00+01', 'St Mary''s Church', 'Church Lane, Bath', true, 1),
  ('e2222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   'Reception', '2027-06-12 17:00:00+01', 'The Old Barn', 'Barn Road, Bath', true, 2),
  ('e3333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
   'Evening party', '2027-06-12 20:00:00+01', 'The Old Barn', 'Barn Road, Bath', true, 3)
on conflict (id) do nothing;

insert into public.tags (id, wedding_id, name, colour) values
  ('fa111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'family',  '#7c5c3e'),
  ('fa222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'uni',     '#2f6f4f'),
  ('fa333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'rugby',   '#b07d2b'),
  ('fa444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 'work',    '#4a5b8c'),
  ('fa555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'VIP',     '#8c2f4a')
on conflict (id) do nothing;

-- Households, ranked. Ranks are base-62 fractional indexes; 'a1' sorts first.
-- The cut line sits at 'a6', so a0–a5 are tier A, a6–a7 tier B, the rest C.
insert into public.households (id, wedding_id, display_name, address, rank) values
  ('d0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'The Okonkwo family',  '14 Elm Row, Bath',      'a1'),
  ('d0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Priya & Dev Raman',   '8 Hill St, Bristol',    'a2'),
  ('d0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Grandma Reid',        'Rose Cottage, Wells',   'a3'),
  ('d0000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Tom Whitfield',       '2 Quay View, Bath',     'a4'),
  ('d0000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'The Nakamuras',       '31 Acre Lane, London',  'a5'),
  ('d0000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'Ciara & Joe Byrne',   '5 Strand Rd, Dublin',   'a6'),
  ('d0000000-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', 'Marcus Bell',         '77 Fore St, Exeter',    'a7'),
  ('d0000000-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', 'The Ferreira family', '19 Park Way, Leeds',    'a8'),
  ('d0000000-0000-4000-8000-000000000009', '11111111-1111-4111-8111-111111111111', 'Hannah Lu',           '4 Mill Rd, Cambridge',  'a9'),
  ('d0000000-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'Old rugby lot',       'c/o The Crown, Bath',   'b1')
on conflict (id) do nothing;

insert into public.guests
  (id, wedding_id, household_id, first_name, last_name, email, age_band, side, dietary) values
  ('9a000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000001', 'Chidi',  'Okonkwo',   'chidi@example.test',  'adult',  'partner_a', null),
  ('9a000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000001', 'Ngozi',  'Okonkwo',   'ngozi@example.test',  'adult',  'partner_a', 'Pescatarian'),
  ('9a000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000001', 'Ada',    'Okonkwo',   null,                  'child',  'partner_a', null),
  ('9a000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000001', 'Obi',    'Okonkwo',   null,                  'infant', 'partner_a', null),
  ('9a000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000002', 'Priya',  'Raman',     'priya@example.test',  'adult',  'partner_b', 'No nuts — severe'),
  ('9a000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000002', 'Dev',    'Raman',     'dev@example.test',    'adult',  'partner_b', null),
  ('9a000000-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000003', 'Eileen', 'Reid',      null,                  'adult',  'partner_a', 'Soft food only'),
  ('9a000000-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000004', 'Tom',    'Whitfield', 'tom@example.test',    'adult',  'partner_b', null),
  ('9a000000-0000-4000-8000-000000000009', '11111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000005', 'Yuki',   'Nakamura',  'yuki@example.test',   'adult',  'partner_b', 'Vegetarian'),
  ('9a000000-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000005', 'Ren',    'Nakamura',  'ren@example.test',    'adult',  'partner_b', null),
  ('9a000000-0000-4000-8000-00000000000b', '11111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000006', 'Ciara',  'Byrne',     'ciara@example.test',  'adult',  'partner_a', null),
  ('9a000000-0000-4000-8000-00000000000c', '11111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000006', 'Joe',    'Byrne',     'joe@example.test',    'adult',  'partner_a', 'Coeliac'),
  ('9a000000-0000-4000-8000-00000000000d', '11111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000007', 'Marcus', 'Bell',      'marcus@example.test', 'adult',  'partner_b', null),
  ('9a000000-0000-4000-8000-00000000000e', '11111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000008', 'Ana',    'Ferreira',  'ana@example.test',    'adult',  'partner_a', null),
  ('9a000000-0000-4000-8000-00000000000f', '11111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000008', 'Luis',   'Ferreira',  null,                  'adult',  'partner_a', null),
  ('9a000000-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000009', 'Hannah', 'Lu',        'hannah@example.test', 'adult',  'partner_b', null),
  ('9a000000-0000-4000-8000-000000000011', '11111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-00000000000a', 'Kwame',  'Mensah',    'kwame@example.test',  'adult',  'partner_a', null),
  ('9a000000-0000-4000-8000-000000000012', '11111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-00000000000a', 'Fergus', 'Doyle',     'fergus@example.test', 'adult',  'partner_a', null)
on conflict (id) do nothing;

insert into public.guest_tags (wedding_id, guest_id, tag_id)
select '11111111-1111-4111-8111-111111111111', g.id, 'fa111111-1111-4111-8111-111111111111'
from public.guests g
where g.household_id in ('d0000000-0000-4000-8000-000000000001',
                         'd0000000-0000-4000-8000-000000000003')
on conflict do nothing;

insert into public.guest_tags (wedding_id, guest_id, tag_id)
select '11111111-1111-4111-8111-111111111111', g.id, 'fa333333-3333-4333-8333-333333333333'
from public.guests g
where g.household_id = 'd0000000-0000-4000-8000-00000000000a'
on conflict do nothing;

-- The standard question set, plus one custom.
insert into public.rsvp_questions (wedding_id, label, type, scope, required, sort_order, options) values
  ('11111111-1111-4111-8111-111111111111', 'Dietary requirements',        'short_text', 'guest',     false, 1, '[]'),
  ('11111111-1111-4111-8111-111111111111', 'Allergies',                   'short_text', 'guest',     false, 2, '[]'),
  ('11111111-1111-4111-8111-111111111111', 'Song request',                'short_text', 'guest',     false, 3, '[]'),
  ('11111111-1111-4111-8111-111111111111', 'Do you need transport?',      'boolean',    'household', false, 4, '[]'),
  ('11111111-1111-4111-8111-111111111111', 'Do you need accommodation?',  'boolean',    'household', false, 5, '[]'),
  ('11111111-1111-4111-8111-111111111111', 'Message to the couple',       'long_text',  'household', false, 6, '[]')
on conflict do nothing;

-- Lists + timeline (0004/0005). One list with a section and three items —
-- one dated (on the timeline), one undated, one flagged with a sub-item —
-- enough for both a smoke test of v_timeline_items and the RLS tests below.
insert into public.lists (id, wedding_id, title, kind, color, sort_order) values
  ('b1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   'Decor', 'checklist', '#7c5c3e', 1)
on conflict (id) do nothing;

insert into public.list_sections (id, wedding_id, list_id, title, sort_order) values
  ('b2111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   'b1111111-1111-4111-8111-111111111111', 'Ceremony decor', 1)
on conflict (id) do nothing;

insert into public.list_items (id, wedding_id, list_id, section_id, title, due_date, flagged, sort_order) values
  ('b3111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   'b1111111-1111-4111-8111-111111111111', 'b2111111-1111-4111-8111-111111111111',
   'Order the aisle runner', '2027-04-01', false, 1),
  ('b3111111-1111-4111-8111-222222222222', '11111111-1111-4111-8111-111111111111',
   'b1111111-1111-4111-8111-111111111111', 'b2111111-1111-4111-8111-111111111111',
   'Confirm the florist', null, true, 2)
on conflict (id) do nothing;

insert into public.site_content (wedding_id, block_key, payload, sort_order) values
  ('11111111-1111-4111-8111-111111111111', 'hero',
   '{"headline":"Alex & Sam","date_label":"12 June 2027","location":"Bath, England"}', 1),
  ('11111111-1111-4111-8111-111111111111', 'schedule',
   '{"intro":"The day, roughly."}', 2),
  ('11111111-1111-4111-8111-111111111111', 'travel',
   '{"body":"Bath Spa is the nearest station, 15 minutes by taxi."}', 3),
  ('11111111-1111-4111-8111-111111111111', 'faq',
   '{"items":[{"q":"Can I bring children?","a":"Children are welcome at the ceremony and reception."}]}', 4)
on conflict (wedding_id, block_key) do nothing;

-- ---------------------------------------------------------------------------
-- Wedding 2 — the one nobody in wedding 1 may ever see
-- ---------------------------------------------------------------------------
insert into public.weddings (id, name, wedding_date, capacity)
values ('22222222-2222-4222-8222-222222222222', 'Other Couple', '2027-09-04', 60)
on conflict (id) do nothing;

insert into public.cut_lines (id, wedding_id, label, position, boundary_rank) values
  ('c2222222-2222-4222-8222-000000000001', '22222222-2222-4222-8222-222222222222', 'A', 0, 'a2'),
  ('c2222222-2222-4222-8222-000000000002', '22222222-2222-4222-8222-222222222222', 'B', 1, null)
on conflict (id) do nothing;

insert into public.collaborators (wedding_id, user_id, role) values
  ('22222222-2222-4222-8222-222222222222', 'cccccccc-0000-4000-8000-000000000003', 'owner')
on conflict do nothing;

insert into public.households (id, wedding_id, display_name, rank) values
  ('d0000000-0000-4000-8000-0000000000ff', '22222222-2222-4222-8222-222222222222', 'Secret household', 'a1')
on conflict (id) do nothing;

insert into public.guests (id, wedding_id, household_id, first_name, last_name) values
  ('9a000000-0000-4000-8000-0000000000ff', '22222222-2222-4222-8222-222222222222',
   'd0000000-0000-4000-8000-0000000000ff', 'Secret', 'Guest')
on conflict (id) do nothing;

insert into public.lists (id, wedding_id, title, kind) values
  ('b1111111-1111-4111-8111-0000000000ff', '22222222-2222-4222-8222-222222222222',
   'Secret list', 'generic')
on conflict (id) do nothing;

insert into public.list_items (id, wedding_id, list_id, title) values
  ('b3111111-1111-4111-8111-0000000000ff', '22222222-2222-4222-8222-222222222222',
   'b1111111-1111-4111-8111-0000000000ff', 'Secret task')
on conflict (id) do nothing;
