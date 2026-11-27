-- 0060_seating_large_blocks.sql  (spec 57 A.3)
--
-- A ceremony block ("rows") seats a whole ceremony and a banquet run is a long
-- joined table, so neither fits the 60-seat limit a dinner table has. Every
-- other shape keeps 60. Nothing existing changes: every row already passes.
--
-- Not edited: 0036.

alter table public.seating_tables drop constraint seating_tables_capacity_check;
alter table public.seating_tables
  add constraint seating_tables_capacity_check
  check (capacity between 1 and 60 or (shape in ('rows', 'banquet') and capacity between 1 and 400));
