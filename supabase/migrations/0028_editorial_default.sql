-- ===========================================================================
-- 0028_editorial_default.sql — spec 25, Part C
--
-- Editorial becomes the default theme for a NEW wedding. Nothing already
-- chosen changes (spec 25 Answered, question 5).
--
-- Why this needs a migration at all, when the theme is a code-level default:
--
--   `resolveTheme(null)` returns DEFAULT_THEME, and a wedding with no theme
--   row has never saved one. Those weddings are currently RENDERING Script —
--   not because anybody picked it, but because that is what the fallback says.
--   Flipping the fallback to Editorial in code would therefore restyle every
--   one of them overnight, which is precisely what "nothing existing changes"
--   rules out.
--
-- So: pin what they are already showing. Every existing wedding with no theme
-- row gets an explicit `script` row saying what it has been rendering all
-- along, and the code-level default becomes `editorial` for everything created
-- afterwards.
--
-- Weddings that HAVE a theme row are untouched, whatever it says.
--
-- Idempotent, and safe to run against a project where some of this is already
-- true: the insert skips any wedding that already has a theme row.
-- ===========================================================================

insert into public.site_content (wedding_id, block_key, payload, sort_order, visible)
select w.id, 'theme', jsonb_build_object('preset', 'script'), 0, true
from public.weddings w
where not exists (
  select 1
  from public.site_content sc
  where sc.wedding_id = w.id and sc.block_key = 'theme'
);

comment on table public.site_content is
  'Now holds only the theme (spec 23). 0028 pins every pre-existing wedding to '
  'the Script preset it was already rendering, so the code-level default could '
  'move to Editorial without restyling anybody (spec 25 Part C).';
