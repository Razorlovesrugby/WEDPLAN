"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { refreshSongChart, voteForSong } from "@/server/actions/songs";
import { PREVIEW_NOT_SAVED } from "@/lib/site/preview-guard";
import type { Ban } from "@/lib/site/song-match";
import type { PublicSong } from "@/server/queries/site-extras";
import { SongList, type ChartVote } from "./song-list";
import { SongRequestForm } from "./song-requests";
import { Label } from "./section";

/**
 * The music section: the request form, the chart, and the do-not-play list,
 * sharing one copy of the chart so a song added in the form appears in the
 * chart without reloading the page (spec 31).
 *
 * LIVE BY POLLING (spec 31 Q1). Every fifteen seconds while the tab is
 * visible, the chart asks `refreshSongChart` for fresh counts — the same
 * service-role read the page loaded with, so nothing was opened to `anon` to
 * make it live. After ten minutes without the guest touching the page it
 * slows to once a minute; it stops while the tab is hidden and asks at once
 * when it comes back. Only with a token: the preview has none, and a page
 * without one has no business watching.
 *
 * OPTIMISTIC VOTES. A tap changes the number at once, held locally until a
 * fresh read that was *requested after the tap* arrives — an older read in
 * flight must not snap the number back.
 */

const POLL_MS = 15_000;
const SLOW_POLL_MS = 60_000;
const IDLE_MS = 10 * 60_000;

type Held = ChartVote & { at: number };

export function SongSection({
  weddingSlug,
  token,
  intro,
  placeholders,
  preview,
  initialSongs,
  bans,
  refusal,
  timeZone,
}: {
  weddingSlug: string;
  token: string | null;
  intro: string | null;
  placeholders: { song: string; artist: string | undefined };
  preview: boolean;
  initialSongs: PublicSong[];
  bans: Ban[];
  refusal: string;
  timeZone: string;
}) {
  const router = useRouter();
  const live = Boolean(token) && !preview;
  const canVote = Boolean(token) || preview;

  const [songs, setSongs] = useState(initialSongs);
  const [held, setHeld] = useState<Record<string, Held>>({});
  const [error, setError] = useState<string | null>(null);
  const lastActive = useRef(Date.now());
  // Set when a poll is refused (a reissued invitation, say). A refused poll is
  // counted as a failed token attempt — the same counter that throttles RSVP
  // replies — so a forgotten tab must not keep failing every fifteen seconds
  // and lock its own household out of replying.
  const stopped = useRef(false);

  // A server re-render (router.refresh) hands down a newer list.
  useEffect(() => setSongs(initialSongs), [initialSongs]);

  const refresh = useCallback(async () => {
    if (!token || preview) {
      router.refresh();
      return;
    }
    if (stopped.current) return;
    const askedAt = Date.now();
    const result = await refreshSongChart({ weddingSlug, token });
    if (!result.ok) {
      stopped.current = true;
      return;
    }
    setSongs(result.data);
    // Anything tapped before this read was asked for is now in it.
    setHeld((was) => {
      const next: Record<string, Held> = {};
      for (const [id, vote] of Object.entries(was)) if (vote.at > askedAt) next[id] = vote;
      return next;
    });
  }, [token, preview, weddingSlug, router]);

  // -- polling ------------------------------------------------------------------
  useEffect(() => {
    if (!live) return;
    let timer: number | undefined;

    const schedule = () => {
      window.clearTimeout(timer);
      if (stopped.current || document.visibilityState !== "visible") return;
      const idle = Date.now() - lastActive.current > IDLE_MS;
      timer = window.setTimeout(async () => {
        try {
          await refresh();
        } catch {
          // A dropped connection (one bar in a field) is not a reason to stop:
          // try again next time round.
        }
        schedule();
      }, idle ? SLOW_POLL_MS : POLL_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refresh().catch(() => undefined);
        schedule();
      } else {
        window.clearTimeout(timer);
      }
    };
    const onActive = () => {
      const wasIdle = Date.now() - lastActive.current > IDLE_MS;
      lastActive.current = Date.now();
      if (wasIdle) schedule();
    };

    schedule();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pointerdown", onActive, { passive: true });
    window.addEventListener("scroll", onActive, { passive: true });
    window.addEventListener("keydown", onActive);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", onActive);
      window.removeEventListener("scroll", onActive);
      window.removeEventListener("keydown", onActive);
    };
  }, [live, refresh]);

  // -- voting -------------------------------------------------------------------
  const view = (song: PublicSong): ChartVote => held[song.id] ?? { votes: song.votes, voted: song.votedByViewer };

  function vote(song: PublicSong, only?: "add") {
    if (!canVote) return;
    const before = view(song);
    if (only === "add" && before.voted) return;
    const after: Held = { votes: before.votes + (before.voted ? -1 : 1), voted: !before.voted, at: Date.now() };
    setHeld((was) => ({ ...was, [song.id]: after }));
    setError(null);

    // The preview holds no token, so there is nothing to vote with: it
    // responds locally and says so.
    if (!token) {
      setError(PREVIEW_NOT_SAVED);
      return;
    }

    void voteForSong({ weddingSlug, token, songId: song.id }).then((result) => {
      if (!result.ok) {
        setHeld((was) => ({ ...was, [song.id]: { ...before, at: Date.now() } }));
        setError(result.error);
        return;
      }
      // Restamp on completion: a read asked for between the tap and the write
      // landing would not contain it yet.
      setHeld((was) => (was[song.id] ? { ...was, [song.id]: { ...was[song.id]!, at: Date.now() } } : was));
    }).catch(() => {
      setHeld((was) => ({ ...was, [song.id]: { ...before, at: Date.now() } }));
      setError("We couldn't reach the list just now. Try again in a moment.");
    });
  }

  function voteFor(songId: string) {
    const song = songs.find((candidate) => candidate.id === songId);
    if (song) vote(song, "add");
  }

  return (
    <>
      <SongRequestForm
        weddingSlug={weddingSlug}
        token={token}
        intro={intro}
        placeholders={placeholders}
        preview={preview}
        bans={bans}
        refusal={refusal}
        chart={songs}
        onChanged={() => refresh().catch(() => undefined)}
        onVoteFor={voteFor}
      />

      <SongList
        weddingSlug={weddingSlug}
        songs={songs}
        canVote={canVote}
        local={Object.fromEntries(Object.entries(held).map(([id, { votes, voted }]) => [id, { votes, voted }]))}
        onVote={(song) => vote(song)}
        timeZone={timeZone}
        live={live}
      />
      {error ? <p className="mt-3 text-[0.95rem] text-muted">{error}</p> : null}

      {bans.length > 0 ? (
        <div className="mt-10">
          <Label>Do not play</Label>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {bans.map((ban) => (
              <li key={ban.line} className="text-[1rem] text-muted line-through decoration-accent decoration-2">
                {ban.line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
