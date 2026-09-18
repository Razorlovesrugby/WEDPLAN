-- ===========================================================================
-- 0018: A free-text notes field on every section, replacing 0016's
-- "checklist vs. notes" section kind
-- ===========================================================================
-- Spec 15 §4 (revised) — 0016 built a separate "notes" section kind: pick
-- Checklist or Notes when creating a section, mutually exclusive, fixed at
-- creation. The planner's actual ask, once described in full, is different:
-- every section — new or already existing, "Choose venue," "Tuxedo,"
-- whatever — should have its OWN free-text field sitting under its title,
-- for links and notes that aren't a task, alongside the checklist it
-- already has. Not a separate kind of section; a second thing every section
-- carries. This migration retires 0016's kind column and enum in favour of
-- one nullable text column that works the same way on every section, past
-- or future, with nothing to migrate — no section has ever had notes text
-- before this column existed, whatever its old kind was.
-- ===========================================================================

alter table public.list_sections
  add column notes text;

alter table public.list_sections
  drop column kind;

drop type list_section_kind;
