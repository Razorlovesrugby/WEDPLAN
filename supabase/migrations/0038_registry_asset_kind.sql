-- ===========================================================================
-- 0038_registry_asset_kind.sql — a `registry` kind of site photograph
--
-- Spec 36. Registry item images and the registry's hero live in `site_assets`
-- like every other photograph (one upload path, one encode pipeline, one
-- signed-URL route), but they must not turn up in the Gallery block, which
-- lists by kind. Hence a kind of their own.
--
-- ENUM ONLY, ON PURPOSE. Adding an enum value and using it in the same file
-- throws 55P04 when the file is pasted into the Supabase SQL editor (one
-- implicit transaction) — the 0011 lesson, supabase/migrations/README.md.
-- 0039 is the file that uses it, and must be run second.
-- ===========================================================================

alter type public.site_asset_kind add value if not exists 'registry';
