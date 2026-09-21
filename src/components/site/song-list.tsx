"use client";

import { useState, useTransition } from "react";
import { voteForSong } from "@/server/actions/songs";
import { Label } from "./section";
import type { PublicSong } from "@/server/queries/site-extras";

/**
 * What everyone's picked (spec 25 §11).
 *
 * Spec 23 kept this list planner-facing. Showing it back changes what the form
 * is for — a request nobody sees is a suggestion box, and a list you can see
 * filling up is a thing people join in with — and it is safe here only because
 * nothing reaches it until `arrivalStatus()` says so.
 *
 * **Voting needs a token.** Without one the counts still show, because the
 * ranking is the interesting part, but the button is not offered. A vote
 * without identity is a cookie, and a cookie is a suggestion (Answered,
 * question 4).
 */
export function SongList({
  weddingSlug,
  token,
  songs,
}: {
  weddingSlug: string;
  token: string | null;
  songs: PublicSong[];
}) {
  // Optimistic local state keyed by song id, so a tap feels instant on a phone
  // in a field with one bar. The server is still the authority — a failed
  // write puts the number back.
  const [local, setLocal] = useState<Record<string, { votes: number; voted: boolean }>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (songs.length === 0) return null;

  const view = (song: PublicSong) =>
    local[song.id] ?? { votes: song.votes, voted: song.votedByViewer };

  function vote(song: PublicSong) {
    if (!token) return;
    const before = view(song);
    const after = {
      votes: before.votes + (before.voted ? -1 : 1),
      voted: !before.voted,
    };
    setLocal((was) => ({ ...was, [song.id]: after }));
    setError(null);

    startTransition(async () => {
      const result = await voteForSong({ weddingSlug, token, songId: song.id });
      if (!result.ok) {
        setLocal((was) => ({ ...was, [song.id]: before }));
        setError(result.error);
      }
    });
  }

  return (
    <div className="mt-10">
      <Label>What everyone&rsquo;s picked</Label>
      <ul className="mt-5 divide-y divide-line border-t border-line">
        {songs.map((song) => {
          const { votes, voted } = view(song);
          return (
            <li key={song.id} className="flex items-center justify-between gap-4 py-4">
              <div className="min-w-0">
                <p className="text-[1.0625rem] text-ink">
                  {song.title}
                  {song.artist ? (
                    <span className="italic text-muted"> · {song.artist}</span>
                  ) : null}
                </p>
                {song.askedBy ? (
                  <p className="mt-0.5">
                    <Label>Added by {song.askedBy}</Label>
                  </p>
                ) : null}
              </div>

              {token ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => vote(song)}
                  aria-pressed={voted}
                  aria-label={`${voted ? "Remove your vote for" : "Vote for"} ${song.title}`}
                  className={`shrink-0 border px-4 py-2 text-[0.95rem] transition-colors disabled:opacity-40 ${
                    voted ? "border-accent text-accent" : "border-line text-muted hover:border-ink hover:text-ink"
                  }`}
                >
                  <span aria-hidden="true">{voted ? "★" : "☆"}</span> {votes}
                </button>
              ) : (
                <span className="shrink-0 border border-transparent px-4 py-2 text-[0.95rem] text-muted">
                  <span aria-hidden="true">☆</span> {votes}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {error ? <p className="mt-3 text-[0.95rem] text-muted">{error}</p> : null}
      {!token ? (
        <p className="mt-4 text-[0.9rem] italic text-muted">
          Voting needs your own invitation link — the one in your invitation.
        </p>
      ) : null}
    </div>
  );
}
