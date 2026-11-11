-- ===========================================================================
-- 0047: RSVP answers can be saved (spec 49)
-- ===========================================================================
--
-- The RSVP form saves each answer with an upsert:
--   insert ... on conflict (question_id, guest_id) do update ...
--   insert ... on conflict (question_id, household_id) do update ...
--
-- 0001 made the only unique indexes on those columns PARTIAL
-- (`where guest_id is not null` / `where household_id is not null`).
-- Postgres can only use a partial index as an ON CONFLICT arbiter when the
-- statement repeats its WHERE clause, and PostgREST's on_conflict cannot, so
-- every answer insert failed with 42P10 ("there is no unique or exclusion
-- constraint matching the ON CONFLICT specification") and nothing was saved.
--
-- Plain (non-partial) unique indexes on the same columns fix it. NULLs are
-- distinct in a unique index, so a household answer (guest_id null) never
-- collides with another household answer on the guest key, and vice versa:
-- the rule is exactly the one the partial indexes stated. The partial indexes
-- are left in place (append-only; they are redundant, not wrong).
--
-- Building them cannot fail on existing rows: the partial indexes already
-- enforce the same uniqueness (the decline note, saved without an upsert,
-- is the only thing that has written rows).
-- No new table, so planner_table_access is unchanged.

create unique index if not exists rsvp_answers_question_guest_key
  on public.rsvp_answers (question_id, guest_id);

create unique index if not exists rsvp_answers_question_household_key
  on public.rsvp_answers (question_id, household_id);
