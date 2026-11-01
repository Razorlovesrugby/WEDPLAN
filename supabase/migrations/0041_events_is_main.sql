-- 0041_events_is_main.sql
--
-- Which event is the one that matters. A guest who says yes to the wedding but
-- no to the rehearsal or the day-after lunch is coming; the reply card used to
-- call them "not sure yet" because their answers were not all the same.
--
-- Planner-ticked, default false (so nothing changes until they tick one), and
-- more than one is allowed (a ceremony and a reception are both "the wedding").
-- Existing events named exactly "Wedding" are ticked as a convenience.
alter table public.events
  add column is_main boolean not null default false;

update public.events set is_main = true where lower(trim(name)) = 'wedding';
