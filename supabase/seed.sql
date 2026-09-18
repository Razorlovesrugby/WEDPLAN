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

-- ---------------------------------------------------------------------------
-- The public site (spec 14)
-- ---------------------------------------------------------------------------
-- Enough content that `/w/alex-sam` renders every section type after a reset.
-- Without this the site shows a hero and an RSVP pointer and nothing else,
-- because empty sections do not render — which makes the theme impossible to
-- look at without hand-writing JSON, and makes a working renderer look broken.
--
-- Written in first person plural (Q11), like the real defaults.
insert into public.site_content (wedding_id, block_key, payload, sort_order) values
  ('11111111-1111-4111-8111-111111111111', 'theme',
   '{"preset":"script","palette":"ivory","hero_style":"framed","monogram":true}', -1),
  ('11111111-1111-4111-8111-111111111111', 'hero',
   '{"headline":"Alex & Sam","date_label":"Saturday 12 June 2027","location":"Bath, England"}', 0),
  ('11111111-1111-4111-8111-111111111111', 'countdown',
   '{"enabled":true,"label":"until we say I do"}', 10),
  ('11111111-1111-4111-8111-111111111111', 'story',
   '{"body":"We met in a queue for a very average coffee in 2019, and have been arguing about where to get coffee ever since.\n\nTen years later we would like you all in one room, which is the whole idea.","milestones":[{"date":"August 2019","title":"The queue"},{"date":"March 2026","title":"The question","body":"Asked on a wet Tuesday, which we maintain was romantic."}]}', 20),
  ('11111111-1111-4111-8111-111111111111', 'schedule',
   '{"intro":"Here is how the day runs. Come for all of it if you can.","events":[{"id":"e1111111-1111-4111-8111-111111111111","dress_code":"Lounge suits, summer dresses","hide_time":false}]}', 30),
  ('11111111-1111-4111-8111-111111111111', 'travel',
   '{"intro":"Bath Spa is the nearest station, about fifteen minutes away by taxi.\n\nThere is parking at the venue and you are very welcome to leave a car overnight — we would rather that than anyone driving home."}', 40),
  ('11111111-1111-4111-8111-111111111111', 'stays',
   '{"intro":"A few places we would happily stay ourselves. Book early — it is a busy weekend locally."}', 50),
  ('11111111-1111-4111-8111-111111111111', 'party',
   '{"members":[{"name":"Jo","role":"Best woman","blurb":"Responsible for the speech, and for nothing else."},{"name":"Ravi","role":"Best man","blurb":"Has been told there is no microphone."}]}', 70),
  ('11111111-1111-4111-8111-111111111111', 'things_to_do',
   '{"intro":"If you are making a weekend of it.","items":[{"title":"The Roman Baths","body":"Touristy, and worth it anyway."}]}', 80),
  ('11111111-1111-4111-8111-111111111111', 'faq',
   '{"items":[{"q":"What is the dress code?","a":"Lounge suits and summer dresses. Nothing black tie — we would feel silly.","featured":true,"tags":["The day"]},{"q":"Can I bring a plus one?","a":"Your invitation lists everyone we could fit. The venue caps us at ninety, which went faster than we expected.","featured":true,"tags":["Guests"]},{"q":"Are children invited?","a":"Yes, all of them, all day. There is a room upstairs for anyone who needs a nap, children included.","featured":true,"tags":["Guests"]},{"q":"Where do I park?","a":"There is parking at the venue and you can leave a car overnight.","featured":true,"tags":["Getting there"]},{"q":"What time does it finish?","a":"Carriages at midnight. Taxis need booking in advance around here.","featured":false,"tags":["The day"]},{"q":"What is the gift situation?","a":"You being there is genuinely the gift. We have all the toasters we need.","featured":false,"tags":["Guests"]}]}', 90),
  ('11111111-1111-4111-8111-111111111111', 'rsvp',
   '{"intro":"Your invitation has a link that is personal to your household — it is how we know who is replying.","closes_label":"Please reply by 30 April 2027"}', 100),
  ('11111111-1111-4111-8111-111111111111', 'footer',
   '{"note":"We cannot wait to see you","contact_email":"alexandsam@example.com","hashtag":"#alexandsam2027"}', 110)
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

-- ---------------------------------------------------------------------------
-- Moodboards (0013/0014)
-- ---------------------------------------------------------------------------
-- Two boards on wedding 1 — the two audiences the feature exists for — and
-- one on wedding 2, because the cross-wedding assertions need a second tenant
-- to fail against.
--
-- The storage_path values point at objects that do not exist in any bucket,
-- and that is correct: the seed seeds the database, and a local
-- `supabase start` has an empty bucket. What it exercises is that every
-- surface renders a missing object as a broken tile rather than falling over
-- — which is also what a half-deleted object looks like in production.
insert into public.moodboards (id, wedding_id, title, description, event_id, sort_order) values
  ('c1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'Photography vibes', 'Light, not poses. The getting-ready shots matter more than the group ones.',
   'e1111111-1111-4111-8111-111111111111', 0),
  ('c1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'What to wear', 'Garden party formal. Comfortable shoes — the lawn is real grass.',
   null, 1)
on conflict (id) do nothing;

insert into public.moodboard_items
  (id, wedding_id, moodboard_id, storage_path, thumb_path, content_type, byte_size,
   width, height, uploaded_at, caption, note, source_url, credit, is_cover, sort_order, origin)
values
  ('c2000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'c1000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111/c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001.webp',
   '11111111-1111-4111-8111-111111111111/c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001_thumb.webp',
   'image/webp', 240000, 1600, 1067, now(),
   'Golden hour, back-lit', 'This is the one I actually care about — 6pm, sun behind them.',
   'https://example.com/walled-garden', 'example.com', true, 0, 'upload'),
  ('c2000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'c1000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111/c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000002.webp',
   '11111111-1111-4111-8111-111111111111/c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000002_thumb.webp',
   'image/webp', 180000, 1200, 1600, now(),
   'Confetti, from behind', null, 'https://www.pinterest.com/pin/12345/', null, false, 1, 'pinterest'),
  -- An upload whose bytes never arrived: invisible everywhere except the
  -- board page that created it.
  ('c2000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
   'c1000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111/c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000003.webp',
   '11111111-1111-4111-8111-111111111111/c1000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000003_thumb.webp',
   'image/webp', 0, null, null, null, null, null, null, null, false, 2, 'upload'),
  ('c2000000-0000-4000-8000-000000000011', '11111111-1111-4111-8111-111111111111',
   'c1000000-0000-4000-8000-000000000002',
   '11111111-1111-4111-8111-111111111111/c1000000-0000-4000-8000-000000000002/c2000000-0000-4000-8000-000000000011.webp',
   '11111111-1111-4111-8111-111111111111/c1000000-0000-4000-8000-000000000002/c2000000-0000-4000-8000-000000000011_thumb.webp',
   'image/webp', 150000, 900, 1200, now(),
   'Linen, muted colours', null, null, null, true, 0, 'clip')
on conflict (id) do nothing;

-- The pin id that makes a re-import a no-op.
update public.moodboard_items
   set external_id = '813744956860114778'
 where id = 'c2000000-0000-4000-8000-000000000002';

-- One link share for the photographer, with notes ON; one for a friend with
-- notes off; and the dress-code board published to the RSVP page.
--
-- These token hashes are not derived from any real token — nothing can be
-- opened with them. They exist so the shape is testable.
insert into public.moodboard_shares
  (id, wedding_id, moodboard_id, channel, label, token_hash, token_encrypted,
   show_notes, show_credits, view_count) values
  ('c3000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'c1000000-0000-4000-8000-000000000001', 'link', 'Anna — photographer',
   'seed-hash-photographer', 'seed-encrypted-photographer', true, true, 3),
  ('c3000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'c1000000-0000-4000-8000-000000000001', 'link', 'Mum',
   'seed-hash-mum', 'seed-encrypted-mum', false, true, 0),
  ('c3000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
   'c1000000-0000-4000-8000-000000000002', 'rsvp', null, null, null, false, true, 0)
on conflict (id) do nothing;

insert into public.moodboard_clip_tokens (id, wedding_id, label, token_hash, token_encrypted, default_moodboard_id) values
  ('c4000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'Seed laptop', 'seed-hash-clip', 'seed-encrypted-clip', 'c1000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- Wedding 2's board. Nobody in wedding 1 may ever see this.
insert into public.moodboards (id, wedding_id, title) values
  ('c1000000-0000-4000-8000-0000000000ff', '22222222-2222-4222-8222-222222222222', 'Secret board')
on conflict (id) do nothing;

insert into public.moodboard_items
  (id, wedding_id, moodboard_id, storage_path, thumb_path, content_type, byte_size, uploaded_at) values
  ('c2000000-0000-4000-8000-0000000000ff', '22222222-2222-4222-8222-222222222222',
   'c1000000-0000-4000-8000-0000000000ff',
   '22222222-2222-4222-8222-222222222222/c1000000-0000-4000-8000-0000000000ff/c2000000-0000-4000-8000-0000000000ff.webp',
   '22222222-2222-4222-8222-222222222222/c1000000-0000-4000-8000-0000000000ff/c2000000-0000-4000-8000-0000000000ff_thumb.webp',
   'image/webp', 100000, now())
on conflict (id) do nothing;
