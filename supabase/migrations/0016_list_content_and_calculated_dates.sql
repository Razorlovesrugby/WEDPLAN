-- ===========================================================================
-- 0016: Collaborator display names, notes-kind sections, calculated due dates
-- ===========================================================================
-- Three additive columns for docs/specs/15-list-content-editing-and-calculated-dates.md.
-- No backfill needed for any of them — all three are either nullable with no
-- prior data to reconcile, or default every existing row to its current
-- behaviour unchanged.
-- ===========================================================================

-- Spec 15, section 2: a real name for the assign picker, instead of only a
-- role label. Nullable — a wedding that never sets one keeps working exactly
-- as before, falling back to "Owner"/"Partner" at the application layer.
alter table public.collaborators
  add column display_name text;

-- Spec 15, section 4: a section is either an ordinary checklist (every
-- section today, and the default for any new one) or a "notes" section —
-- plain text lines with no checkbox, due date, flag, priority, or
-- assignment. Fixed at creation; nothing here converts an existing section
-- from one kind to the other. An enum, matching how lists.kind (0004) and
-- list_items.status (0005) already model a small fixed set of values.
create type list_section_kind as enum ('checklist', 'notes');

alter table public.list_sections
  add column kind list_section_kind not null default 'checklist';

-- Spec 15, section 5: a due date can be calculated relative to the wedding
-- date instead of fixed. Non-null means due_date is kept in sync with
-- weddings.wedding_date by the application (updateWeddingSettings), not
-- typed directly — negative is before the wedding, positive after, 0 is on
-- the day. Fixed and calculated are mutually exclusive per item: setting one
-- clears the other at the application layer, same as unit_price/quantity's
-- existing "meaningful only for its own mode" convention (0011).
alter table public.list_items
  add column due_date_offset_days integer;
