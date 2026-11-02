-- 0042_registry_contribute.sql
--
-- The registry's Contribute block (spec 38): the couple's gift funds and bank
-- details, shown on /registry/<slug> above or below the gifts, for the guest
-- who would rather give than buy.
--
-- `contribute_position` replaces the boolean `show_funds`, which could only put
-- it at the bottom. `show_funds` is KEPT and no longer read (the precedent is
-- gift_funds.target_minor: an append-only history does not drop a column the
-- app has stopped using). Text with a check rather than an enum, so this is one
-- file with no 55P04 split.
--
-- Registries that had the old tick on become 'below' so nothing changes
-- appearance; every other registry is 'off'.
alter table public.registry_settings
  add column contribute_position text not null default 'off',
  add column contribute_heading text,
  add column contribute_text text,
  add column contribute_button_only boolean not null default false,
  add constraint registry_settings_contribute_position_check
    check (contribute_position in ('off', 'above', 'below')),
  add constraint registry_settings_contribute_heading_check
    check (contribute_heading is null or char_length(contribute_heading) <= 120),
  add constraint registry_settings_contribute_text_check
    check (contribute_text is null or char_length(contribute_text) <= 600);

update public.registry_settings
   set contribute_position = 'below'
 where show_funds;
