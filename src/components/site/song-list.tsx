"use client";

import { useState, useTransition } from "react";
import { voteForSong } from "@/server/actions/songs";
import { PREVIEW_NOT_SAVED } from "@/lib/site/preview-guard";
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
 * The list is ordered by votes and does NOT re-sort under a vote: a row that
 * moves out from beneath a thumb is how somebody votes for the wrong song, so
 * the order is the server's and changes the next time the page loads
 * (spec 28 §6.2).
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
  preview = false,
}: {
  weddingSlug: string;
  token: string | null;
  songs: PublicSong[];
  /** The editor's preview: the button responds and nothing is saved (spec 28 §4.3). */
  preview?: boolean;
}) {
  const canVote = Boolean(token) || preview;
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
    if (!canVote) return;
    const before = view(song);
    const after = {
      votes: before.votes + (before.voted ? -1 : 1),
      voted: !before.voted,
    };
    setLocal((was) => ({ ...was, [song.id]: after }));
    setError(null);

    // The preview holds no token, so there is nothing to vote with: it
    // responds locally and says so.
    if (!token) {
      setError(PREVIEW_NOT_SAVED);
      return;
    }

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
                {song.askedByViewer ? (
                  // Theirs, said so — not "Added by <their own name>", which is
                  // the same fact in the third person.
                  <p className="mt-0.5">
                    <Label>Your suggestion</Label>
                  </p>
                ) : song.askedBy ? (
                  <p className="mt-0.5">
                    <Label>Added by {song.askedBy}</Label>
                  </p>
                ) : null}
              </div>

              {canVote ? (
                // An explicit upvote, not a star: a star reads as a rating or a
                // favourite, and nobody knew it was a vote (spec 28 §6.2). The
                // word is dropped on a phone, where the arrow and the count
                // carry it and the row keeps its room.
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => vote(song)}
                  aria-pressed={voted}
                  aria-label={`${voted ? "Take back your vote for" : "Vote for"} ${song.title}`}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[0.9rem] transition-colors disabled:opacity-40 ${
                    voted
                      ? "border-accent bg-accent text-paper"
                      : "border-line text-muted hover:border-ink hover:text-ink"
                  }`}
                >
                  <span aria-hidden="true">▲</span>
                  <span className="tabular-nums">{votes}</span>
                  <span aria-hidden="true" className="hidden sm:inline">
                    {voted ? "Voted" : "Vote"}
                  </span>
                </button>
              ) : (
                <span className="shrink-0 border border-transparent px-4 py-2 text-[0.95rem] text-muted">
                  <span aria-hidden="true">▲</span> {votes}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {error ? <p className="mt-3 text-[0.95rem] text-muted">{error}</p> : null}
      {!canVote ? (
        <p className="mt-4 text-[0.9rem] italic text-muted">
          Voting needs your own invitation link — the one in your invitation.
        </p>
      ) : null}
    </div>
  );
}
