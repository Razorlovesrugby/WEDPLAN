"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { requestSong, searchSongs, type RequestSongOutcome, type SongSearchResult } from "@/server/actions/songs";
import { PREVIEW_NOT_SAVED } from "@/lib/site/preview-guard";
import { isBanned, sameSong, type Ban } from "@/lib/site/song-match";
import type { PublicSong } from "@/server/queries/site-extras";
import { Art } from "./song-list";

/**
 * Asking for a song (spec 23 §8, spec 31 §6 and §7a).
 *
 * On a household's own page the song box is a search: our server asks Apple,
 * up to six results come back with their covers (through our proxy — the
 * guest's browser never talks to Apple), and a tap adds one. Under them,
 * "Can't find it? Add it anyway" opens the by-hand fields, which are also
 * what shows when search is unavailable or there is no token to search with.
 *
 * Three answers besides "added", all from the server:
 *   - the same track is already there → their vote went on it;
 *   - something very like it is there → "vote for that one, or add yours";
 *   - it is on the do-not-play list → the couple's line, as a joke, not an error.
 *
 * The do-not-play and already-on-the-list marks on search results are drawn
 * here from the same `song-match` rules the server uses, so a result is never
 * offered as addable and then refused. The server still decides.
 */

const DEBOUNCE_MS = 300;

type Notice =
  | { kind: "added"; line: string }
  | { kind: "voted"; title: string }
  | { kind: "banned"; line: string }
  | { kind: "duplicate"; songId: string; title: string; artist: string | null; pending: Pending };

type Pending = { title: string; artist: string; catalogueId: string | null };

export function SongRequestForm({
  weddingSlug,
  token,
  intro,
  placeholders = { song: "Anything but Wonderwall", artist: undefined },
  preview = false,
  bans,
  refusal,
  chart,
  onChanged,
  onVoteFor,
}: {
  weddingSlug: string;
  /** The household's credential. Absent before an invitation has been issued. */
  token: string | null;
  intro: string | null;
  /** The grey hints in the two boxes — the planner's own, or the default joke (spec 28 §6.3). */
  placeholders?: { song: string; artist: string | undefined };
  /** The editor's preview: the form works and nothing is sent (spec 28 §4.3). */
  preview?: boolean;
  bans: Ban[];
  refusal: string;
  /** What is on the chart now, for marking search results already on it. */
  chart: PublicSong[];
  /** Something changed on the chart; read it again. */
  onChanged: () => void;
  /** "Vote for that one instead" — adds a vote, never takes one back. */
  onVoteFor: (songId: string) => void;
}) {
  const canSearch = Boolean(token) && !preview;

  const [query, setQuery] = useState("");
  const [artist, setArtist] = useState("");
  const [askedBy, setAskedBy] = useState("");
  const [byHand, setByHand] = useState(!canSearch);
  const [results, setResults] = useState<SongSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchDown, setSearchDown] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const latest = useRef(0);

  // -- search, debounced --------------------------------------------------------
  useEffect(() => {
    if (!canSearch || byHand) return;
    const term = query.trim();
    if (term.length < 2) {
      latest.current += 1;
      setSearching(false);
      setResults([]);
      return;
    }
    const ticket = ++latest.current;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      const result = await searchSongs({ weddingSlug, token, query: term });
      // A slower answer to an older query must not overwrite a newer one.
      if (ticket !== latest.current) return;
      setSearching(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data === null) {
        // Apple can't be asked right now. The form still works.
        setSearchDown(true);
        setByHand(true);
        setResults([]);
        return;
      }
      setResults(result.data);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, canSearch, byHand, weddingSlug, token]);

  // -- sending --------------------------------------------------------------------
  function send(song: Pending, force = false) {
    setError(null);
    setNotice(null);

    if (preview) {
      setError(PREVIEW_NOT_SAVED);
      return;
    }

    startTransition(async () => {
      const result = await requestSong({
        weddingSlug,
        token,
        title: song.title,
        artist: song.artist,
        askedBy,
        catalogueId: song.catalogueId,
        force,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      settle(result.data, song);
    });
  }

  function settle(outcome: RequestSongOutcome, song: Pending) {
    switch (outcome.outcome) {
      case "added":
        setNotice({ kind: "added", line: [song.title, song.artist].filter(Boolean).join(" · ") });
        reset();
        // From their own link it is on the list already, with their vote on
        // it. From a link with no invitation behind it, it is queued and the
        // chart simply doesn't change.
        onChanged();
        return;
      case "voted":
        setNotice({ kind: "voted", title: outcome.title });
        reset();
        onChanged();
        return;
      case "banned":
        setNotice({ kind: "banned", line: outcome.line });
        return;
      case "duplicate":
        setNotice({ kind: "duplicate", songId: outcome.songId, title: outcome.title, artist: outcome.artist, pending: song });
        return;
    }
  }

  function reset() {
    setQuery("");
    setArtist("");
    setResults([]);
    if (canSearch && !searchDown) setByHand(false);
  }

  function submitByHand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) return;
    send({ title: query.trim(), artist: artist.trim(), catalogueId: null });
  }

  const onChart = (result: SongSearchResult) => chart.some((song) => sameSong(result, song));

  return (
    <div className="mx-auto max-w-lg">
      {intro ? <p className="mb-6 text-center text-[1.0625rem] text-muted">{intro}</p> : null}

      <form onSubmit={submitByHand} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[0.9rem] text-muted">{byHand ? "Song" : "Find a song"}</span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setNotice(null);
              setError(null);
            }}
            required
            maxLength={200}
            placeholder={placeholders.song}
            autoComplete="off"
            enterKeyHint={byHand ? "send" : "search"}
            role={byHand ? undefined : "combobox"}
            aria-expanded={byHand ? undefined : results.length > 0}
            aria-controls={byHand ? undefined : "song-search-results"}
            className="w-full border border-line bg-white p-2 text-[1rem]"
          />
        </label>

        {!byHand ? (
          <div aria-live="polite">
            {searching && results.length === 0 ? <p className="text-[0.9rem] text-muted">Looking…</p> : null}
            {results.length > 0 ? (
              <ul id="song-search-results" className="divide-y divide-line border border-line bg-white">
                {results.map((result) => {
                  const banned = isBanned(result, bans);
                  const listed = !banned && onChart(result);
                  return (
                    <li key={result.catalogueId}>
                      <button
                        type="button"
                        disabled={pending || Boolean(banned)}
                        onClick={() =>
                          send({ title: result.title, artist: result.artist, catalogueId: result.catalogueId })
                        }
                        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent/5 disabled:cursor-not-allowed"
                      >
                        <Art src={result.art} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-[1rem] ${banned ? "text-muted line-through" : "text-ink"}`}>
                            {result.title}
                          </span>
                          <span className="block truncate text-[0.85rem] italic text-muted">
                            {banned ? refusal : result.artist}
                          </span>
                        </span>
                        {listed ? <span className="shrink-0 text-[0.8rem] text-accent">On the list · ▲ vote</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {query.trim().length >= 2 ? (
              <button
                type="button"
                onClick={() => setByHand(true)}
                className="mt-2 text-[0.9rem] text-muted underline underline-offset-4 hover:text-ink"
              >
                Can&rsquo;t find it? Add it anyway
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {searchDown ? (
              <p className="text-[0.9rem] italic text-muted">Search is having a moment — add it by hand.</p>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-[0.9rem] text-muted">Artist (optional)</span>
              <input
                value={artist}
                onChange={(event) => setArtist(event.target.value)}
                maxLength={200}
                placeholder={placeholders.artist}
                className="w-full border border-line bg-white p-2 text-[1rem]"
              />
            </label>
            {!token ? (
              <label className="block">
                <span className="mb-1 block text-[0.9rem] text-muted">Your name (optional)</span>
                <input
                  value={askedBy}
                  onChange={(event) => setAskedBy(event.target.value)}
                  maxLength={80}
                  className="w-full border border-line bg-white p-2 text-[1rem]"
                />
              </label>
            ) : null}
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={pending || query.trim().length === 0}
                className="border border-accent px-5 py-2 text-[0.72rem] uppercase tracking-[0.14em] text-accent hover:bg-accent hover:text-paper disabled:opacity-50"
              >
                Add it to the list
              </button>
              {canSearch && !searchDown ? (
                <button
                  type="button"
                  onClick={() => setByHand(false)}
                  className="text-[0.9rem] text-muted underline underline-offset-4 hover:text-ink"
                >
                  Back to search
                </button>
              ) : null}
            </div>
          </>
        )}
      </form>

      {notice ? (
        <div className="mt-5 text-[0.95rem] text-muted" aria-live="polite">
          {notice.kind === "added" ? (
            <p>
              Thank you — {notice.line} {token ? "is on the list, with your vote." : "is with the couple."}
            </p>
          ) : null}
          {notice.kind === "voted" ? (
            <p>Great minds — {notice.title} was already on the list, so your vote went on it.</p>
          ) : null}
          {notice.kind === "banned" ? <p className="italic text-ink">↳ {notice.line}</p> : null}
          {notice.kind === "duplicate" ? (
            <div className="space-y-2">
              <p>
                Already on the list: <span className="text-ink">{notice.title}</span>
                {notice.artist ? <span className="italic"> · {notice.artist}</span> : null}
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onVoteFor(notice.songId);
                    setNotice({ kind: "voted", title: notice.title });
                    reset();
                  }}
                  className="rounded-full border border-accent px-3.5 py-1.5 text-[0.9rem] text-accent hover:bg-accent hover:text-paper"
                >
                  ▲ Vote for it
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => send(notice.pending, true)}
                  className="text-[0.9rem] underline underline-offset-4 hover:text-ink"
                >
                  No, mine&rsquo;s different — add it
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-4 text-[0.95rem] text-red-700">{error}</p> : null}
    </div>
  );
}
