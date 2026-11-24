-- 0055_venue_designer_enums.sql  (spec 57)
--
-- New enum values only. They are in their own file because a value added in a
-- transaction can't be used until that transaction commits (spec 6.1's 55P04);
-- 0057 uses them.

alter type public.seating_table_shape add value if not exists 'sweetheart';
alter type public.seating_table_shape add value if not exists 'rows';
alter type public.seating_table_shape add value if not exists 'oval';
alter type public.seating_table_shape add value if not exists 'half_moon';
alter type public.seating_table_shape add value if not exists 'serpentine';
alter type public.seating_table_shape add value if not exists 'banquet';

alter type public.seating_fixture_kind add value if not exists 'lounge';
alter type public.seating_fixture_kind add value if not exists 'kids_area';
alter type public.seating_fixture_kind add value if not exists 'floral_arch';
alter type public.seating_fixture_kind add value if not exists 'garland';
alter type public.seating_fixture_kind add value if not exists 'aisle_flowers';
alter type public.seating_fixture_kind add value if not exists 'candles';
alter type public.seating_fixture_kind add value if not exists 'plant';
alter type public.seating_fixture_kind add value if not exists 'sign';
alter type public.seating_fixture_kind add value if not exists 'lantern';
alter type public.seating_fixture_kind add value if not exists 'drape';
alter type public.seating_fixture_kind add value if not exists 'marquee';
alter type public.seating_fixture_kind add value if not exists 'tree';
alter type public.seating_fixture_kind add value if not exists 'path';
alter type public.seating_fixture_kind add value if not exists 'pool';
alter type public.seating_fixture_kind add value if not exists 'garden_bed';
alter type public.seating_fixture_kind add value if not exists 'slope';
alter type public.seating_fixture_kind add value if not exists 'custom';
