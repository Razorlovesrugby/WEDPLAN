-- ===========================================================================
-- 0032: what a site photograph needs to arrive well (spec 27 step 2)
-- ===========================================================================
-- Four nullable-or-defaulted columns on `site_assets`, all of them describing
-- how to *draw* an image the couple uploaded, none of them describing who may
-- see it. The table already carries `wedding_id`, `unique (id, wedding_id)` and
-- the tenant policy from 0002/0017; nothing here widens any of that.
--
--   variants  The long-edge widths, besides the original, that were uploaded
--             alongside it (`{480,960}`). Empty means "only the original", which
--             is what every photograph uploaded before this migration is, and
--             the renderer then emits no `srcset` for it. A list rather than a
--             boolean because it is the *renderer's* knowledge: a variant that
--             failed to upload is simply absent from the list, never a broken
--             URL in a `srcset`.
--
--   colour    One dominant colour, `#rrggbb`, painted behind the `<img>` until
--             it decodes — so a slow connection shows a tinted box instead of a
--             blank one that then pops. Deliberately not `blurhash`, which is
--             already on this table, unused: decoding one needs a client-side
--             library on every guest page, and one flat colour is most of the
--             effect for none of the bytes.
--
--   focal_x / focal_y  Where the subject is, 0 to 1 from the top-left. Becomes
--             `object-position`, so a face stays in frame whether the same
--             photograph is cropped to a 390px portrait or a 1440px banner.
--             Both or neither: half a point means nothing.
--
-- Existing rows are untouched and keep working at one size with no placeholder
-- and the browser's default crop — "new uploads only" (spec 27 Q7).
-- ===========================================================================

alter table public.site_assets
  add column variants integer[] not null default '{}',
  add column colour   text,
  add column focal_x  numeric(4, 3),
  add column focal_y  numeric(4, 3);

alter table public.site_assets
  add constraint site_assets_variants_known
    check (variants <@ array[480, 960]),
  add constraint site_assets_colour_hex
    check (colour is null or colour ~ '^#[0-9a-f]{6}$'),
  add constraint site_assets_focal_range
    -- Written as two terms because a CHECK that evaluates to NULL PASSES: with
    -- only "both null, or both in range", a half-set point is NULL on one side
    -- and false on the other and would be accepted.
    check (
      (focal_x is null) = (focal_y is null)
      and (focal_x is null or (focal_x between 0 and 1 and focal_y between 0 and 1))
    );
