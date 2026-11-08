-- ===========================================================================
-- 0046: the registry can follow the invitation's look (spec 44)
-- ===========================================================================
--
-- One switch on registry_settings. Off for every registry, new or existing
-- (spec 44 Q1: "Yes, but off by default"), so nothing a guest sees changes
-- until the couple turns it on. When on, the public registry page takes the
-- invitation's colours (site_content 'theme') and the matching type pairing
-- instead of its own `palette` and `type_pairing`, which are kept, unread,
-- so switching back restores exactly what was chosen.
--
-- No new table, so planner_table_access is unchanged; registry_settings is
-- already audited (0039) and its RLS covers the new column.

alter table public.registry_settings
  add column use_site_theme boolean not null default false;
