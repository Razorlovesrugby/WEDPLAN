-- ===========================================================================
-- 0035: the song chart (spec 31)
-- ===========================================================================
-- Four columns on `song_requests` and one index. Nothing new is a table: the
-- chart is the same list spec 23 built and spec 25 rendered back, made to
-- move and given a little more to say.
--
--   played_at     When the couple marked it played, so the guest's chart can
--                 read "Played at 9:42 pm" and the newest one "Now playing".
--                 Kept in step with `status` by a trigger rather than by the
--                 action: a timestamp that disagrees with the status beside
--                 it is worse than no timestamp, and two write paths (the
--                 status buttons and the big-button night mode) is one more
--                 than needs to remember.
--
--   couples_pick  The couple's ♥ on up to three songs. A badge, not a rank:
--                 it never changes the order. The cap of three is checked in
--                 the action — it is a design choice about how loud the
--                 couple's voice is, not an integrity rule.
--
--   catalogue_id  The iTunes trackId, as digits in text, for a song picked
--                 from search. Null for a song typed in by hand. Two picks of
--                 the same track are the same song, so the second becomes a
--                 vote on the first — and the partial unique index below is
--                 what makes that true when two households pick it in the
--                 same second.
--
--   artwork_url   The upstream artwork address. NEVER put in front of a
--                 browser directly: the guest page loads it only through
--                 /api/song-art, so a guest's IP and their private page URL
--                 never reach Apple (spec 23 Q1, spec 31 §7a). The check
--                 constrains it to Apple's image host, so a row that somehow
--                 carried any other URL could not make that route a relay.
--
-- Additive columns, no enum: no 55P04 split.
-- ===========================================================================

alter table public.song_requests
  add column played_at    timestamptz,
  add column couples_pick boolean not null default false,
  add column catalogue_id text,
  add column artwork_url  text,
  add constraint song_requests_catalogue_id_digits
    check (catalogue_id is null or catalogue_id ~ '^[0-9]{1,20}$'),
  add constraint song_requests_artwork_url_apple
    check (artwork_url is null or artwork_url ~ '^https://[a-z0-9-]+(\.[a-z0-9-]+)*\.mzstatic\.com/');

create unique index song_requests_catalogue_key
  on public.song_requests (wedding_id, catalogue_id)
  where catalogue_id is not null;

-- ---------------------------------------------------------------------------
-- played_at follows status
-- ---------------------------------------------------------------------------
-- Stamped on the way into 'played', cleared on the way out. An update that
-- leaves the status alone leaves the time alone, so re-saving a played song
-- does not move it to "Now playing" again.
create or replace function public.song_requests_played_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'played' then
    if tg_op = 'INSERT' or old.status is distinct from 'played' then
      new.played_at := coalesce(new.played_at, now());
    end if;
  else
    new.played_at := null;
  end if;
  return new;
end;
$$;

create trigger song_requests_played_at
  before insert or update of status on public.song_requests
  for each row execute function public.song_requests_played_at();
