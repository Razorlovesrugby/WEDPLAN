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
  (id, name, wedding_date, timezone, capacity, rsvp_lock_at)
values
  ('11111111-1111-4111-8111-111111111111', 'Alex & Sam', '2027-06-12', 'Europe/London',
   90, '2027-04-30 23:59:00+01')
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

-- guest_note is the on-the-day run-down (spec 21 §5.4): the couple talking to
-- a guest, stitched into the pages of the households invited to that event.
-- Not the run sheet, which carries supplier phone numbers.
insert into public.events (id, wedding_id, name, starts_at, venue, address, is_public, sort_order, guest_note) values
  ('e1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   'Ceremony', '2027-06-12 13:00:00+01', 'St Mary''s Church', 'Church Lane, Bath', true, 1,
   'Park on Church Lane or in the square behind it. Please be seated by ten to — the doors close on the hour.'),
  ('e2222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   'Reception', '2027-06-12 17:00:00+01', 'The Old Barn', 'Barn Road, Bath', true, 2,
   'Drinks on the lawn while we disappear for photographs. Dinner is at seven; the barn is a five minute walk up the track, and the ground is uneven in heels.'),
  ('e3333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
   'Evening party', '2027-06-12 20:00:00+01', 'The Old Barn', 'Barn Road, Bath', true, 3,
   'Bacon rolls at midnight. The last coach back into town leaves at half past twelve from the top of the track.')
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
-- The theme is configuration rather than content, so it stays in
-- site_content and /site/theme keeps writing it (spec 23 §4).
insert into public.site_content (wedding_id, block_key, payload, sort_order) values
  ('11111111-1111-4111-8111-111111111111', 'theme',
   '{"preset":"script","palette":"ivory","hero_style":"framed","monogram":true}', -1)
on conflict (wedding_id, block_key) do nothing;

-- ---------------------------------------------------------------------------
-- The site itself, as blocks (spec 23)
-- ---------------------------------------------------------------------------
-- A page is a list of blocks now. This seeds a full example — every block type
-- the renderer knows how to draw — so a local reset shows a real site rather
-- than an empty builder, and so `/site`'s preview has something in it.
insert into public.site_blocks (wedding_id, type, payload, sort_order) values
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
on conflict do nothing;

-- What guests actually see: the published snapshot. Without one the public
-- page is blank, because it reads revisions and never the draft.
insert into public.site_revisions (wedding_id, blocks, note)
select
  w.id,
  coalesce(
    (
      select jsonb_agg(
               jsonb_build_object(
                 'id', b.id, 'type', b.type, 'payload', b.payload,
                 'style', b.style, 'visible', b.visible, 'audience', b.audience
               ) order by b.sort_order
             )
      from public.site_blocks b where b.wedding_id = w.id
    ),
    '[]'::jsonb
  ),
  'Seeded'
from public.weddings w
where w.id = '11111111-1111-4111-8111-111111111111';


-- ---------------------------------------------------------------------------
-- Spec 25 — the things blocks now read
-- ---------------------------------------------------------------------------
-- Seeded DIRECTLY rather than left to 0026's backfill, for the reason spec 23
-- learned the hard way (its correction 3): a fresh database applies every
-- migration BEFORE the seed, so the backfill has already run and seen nothing
-- by the time these blocks exist. A local reset would otherwise produce a
-- schedule with dress-code strings in its payload and no dress_codes rows —
-- the feature looking broken on the one database anybody develops against.

insert into public.dress_codes (id, wedding_id, name, sort_order) values
  ('dc000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Lounge suits, summer dresses', 10),
  ('dc000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Whatever you danced in', 20)
on conflict (id) do nothing;

-- Two labelled notes, which is what the app pre-fills a new code with. The
-- labels are content, not schema — rename them, delete one, add a third.
insert into public.dress_code_notes (id, wedding_id, dress_code_id, label, body, sort_order) values
  ('dd000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'dc000000-0000-4000-8000-000000000001',
   'For her', 'Summer dresses, and something warmer for the lawn once the sun goes. The ground by the barn is uneven, so a block heel will serve you better than a stiletto.', 10),
  ('dd000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'dc000000-0000-4000-8000-000000000001',
   'For him', 'A lounge suit, no tie needed. It is June in a field — linen over wool if you have it.', 20),
  ('dd000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'dc000000-0000-4000-8000-000000000002',
   'Everyone', 'The evening is in the barn and nobody is checking. Bring the shoes you can actually dance in.', 10)
on conflict (id) do nothing;

update public.events set dress_code_id = 'dc000000-0000-4000-8000-000000000001'
 where wedding_id = '11111111-1111-4111-8111-111111111111'
   and id in ('e1111111-1111-4111-8111-111111111111', 'e2222222-2222-4222-8222-222222222222');
update public.events set dress_code_id = 'dc000000-0000-4000-8000-000000000002'
 where wedding_id = '11111111-1111-4111-8111-111111111111' and id = 'e3333333-3333-4333-8333-333333333333';

-- Arrival points and typed legs. Nullable everywhere: the second option below
-- deliberately carries no cost and no duration, so the renderer is exercised
-- against a half-filled row rather than only a complete one.
insert into public.arrival_points (id, wedding_id, code, name, region, minutes_to_venue, sort_order) values
  ('ab000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'BRS', 'Bristol Airport', 'England', 55, 10),
  ('ab000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'LHR', 'London Heathrow', 'England', 150, 20)
on conflict (id) do nothing;

-- Cost is integer minor units, NZD (spec 18). 4500 is $45.00.
insert into public.transport_options
  (id, wedding_id, arrival_point_id, kind, name, detail, duration_minutes, cost_low, cost_high, sort_order) values
  ('ac000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'ab000000-0000-4000-8000-000000000001',
   'taxi', 'Taxi from Bristol Airport', 'Straight to Bath. Book ahead on a Saturday or you will wait.', 55, 6500, 8500, 10),
  ('ac000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'ab000000-0000-4000-8000-000000000002',
   'train', 'Train to Bath Spa', 'Paddington to Bath Spa, then a ten minute taxi. Change at Reading on some services.', 150, 4500, 12000, 20),
  ('ac000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', null,
   'parking', 'Parking at the venue', 'There is room for about thirty cars, and you are very welcome to leave one overnight.', null, null, null, 30)
on conflict (id) do nothing;

-- A coach run that serves a specific event, so the schedule has something to
-- render underneath the evening party. A run with no event still renders in
-- the coach block, which is how every run behaved before 0026.
insert into public.coach_runs (id, wedding_id, event_id, direction, label, departs_at, capacity, sort_order) values
  ('ae000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'e3333333-3333-4333-8333-333333333333',
   'to_venue', 'Coach to the barn', '2027-06-12 19:15:00+01', 48, 10),
  ('ae000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', null,
   'from_venue', 'Last coach into town', '2027-06-13 00:30:00+01', 48, 20)
on conflict (id) do nothing;

insert into public.coach_stops (id, wedding_id, coach_run_id, name, pickup_at, sort_order) values
  ('af000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'ae000000-0000-4000-8000-000000000001',
   'The Crown, Bath', '2027-06-12 19:15:00+01', 10),
  ('af000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'ae000000-0000-4000-8000-000000000001',
   'Bath Spa station', '2027-06-12 19:30:00+01', 20)
on conflict (id) do nothing;

-- Guest participation (Part B). One note published from a household link, one
-- from the shared page still waiting — which is the whole moderation rule,
-- visible in the seed rather than only in a test.
insert into public.guest_notes (id, wedding_id, household_id, author_name, body, status) values
  ('bd000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000001',
   'Ada Okonkwo', 'From the first dinner you two cooked for us, we knew. Cannot wait to watch you do this.', 'approved'),
  ('bd000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', null,
   'Someone from the internet', 'Congratulations! Great website.', 'new')
on conflict (id) do nothing;

-- Songs: one approved (so the public list has something), one still waiting.
-- The approved one came from a household link, which under spec 25's rule is
-- why it is approved at all.
insert into public.song_requests (id, wedding_id, household_id, asked_by, title, artist, status) values
  ('ba000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000001',
   'Marit', 'This Must Be the Place', 'Talking Heads', 'approved'),
  ('ba000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', null,
   'Jeff', 'September', 'Earth, Wind & Fire', 'new')
on conflict (id) do nothing;

insert into public.song_votes (wedding_id, song_request_id, household_id) values
  ('11111111-1111-4111-8111-111111111111', 'ba000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002'),
  ('11111111-1111-4111-8111-111111111111', 'ba000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003')
on conflict do nothing;

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
