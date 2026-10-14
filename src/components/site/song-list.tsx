"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Label } from "./section";
import { formatTime } from "@/lib/format";
import {
  CHART_TOP,
  HOLD_MS,
  heldOrder,
  mayReorder,
  movementSince,
  nowPlayingId,
  type Movement,
} from "@/lib/site/song-chart";
import type { PublicSong } from "@/server/queries/site-extras";

/**
 * The chart (spec 25 §11, spec 28 §6.2, spec 31 §4).
 *
 * Spec 23 kept this list planner-facing; spec 25 showed it back; spec 31 makes
 * it move. The counts update the moment fresh data arrives. The ORDER updates
 * too — rows slide to their new place — but never within three seconds of the
 * guest touching the list (`mayReorder`): a row that moves out from beneath a
 * thumb is how somebody votes for the wrong song, which is why spec 28 froze
 * the order in the first place. A tap is bound to a song id, never to a
 * position, so even a row that moves mid-tap votes for the song that was seen.
 *
 * Movement badges (▲2 / ▼1 / NEW) compare with the ranking this browser last
 * saw, kept in localStorage — per browser, so a new phone simply sees no
 * movement, which is wrong only harmlessly. On a first visit the baseline is
 * the ranking the page loaded with, so the list still shows what moved while
 * they watched.
 *
 * **Voting needs a token.** Without one the counts still show, because the
 * ranking is the interesting part, but the button is not offered.
 */

export type ChartVote = { votes: number; voted: boolean };

export function SongList({
  weddingSlug,
  songs,
  canVote,
  local,
  onVote,
  timeZone,
  live,
}: {
  weddingSlug: string;
  songs: PublicSong[];
  canVote: boolean;
  /** Optimistic votes the parent holds until the next fresh read confirms them. */
  local: Record<string, ChartVote>;
  onVote: (song: PublicSong) => void;
  timeZone: string;
  /** True while the chart is polling for fresh counts. */
  live: boolean;
}) {
  const fresh = useMemo(() => songs.map((song) => song.id), [songs]);
  const byId = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs]);

  // -- the hold ----------------------------------------------------------------
  const [order, setOrder] = useState<string[]>(fresh);
  const lastTouch = useRef<number | null>(null);
  const [released, setReleased] = useState(0);

  useEffect(() => {
    if (mayReorder(lastTouch.current)) setOrder(fresh);
    else setOrder((shown) => heldOrder(shown, fresh));
  }, [fresh, released]);

  function touched() {
    lastTouch.current = Date.now();
    window.setTimeout(() => setReleased((n) => n + 1), HOLD_MS + 50);
  }

  // -- movement since last visit -----------------------------------------------
  const storageKey = `wedplan:song-chart:${weddingSlug}`;
  const [baseline, setBaseline] = useState<string[] | null>(null);
  useEffect(() => {
    let previous: string[] | null = null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.every((id) => typeof id === "string")) previous = parsed;
    } catch {
      // Private window, blocked storage: no baseline beyond this visit.
    }
    setBaseline(previous ?? fresh);
    // Once, on arrival. The baseline is "what you last saw", not "what you saw
    // a moment ago".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(order));
    } catch {
      // Not remembering is fine.
    }
  }, [order, storageKey]);
  const moves = useMemo(() => movementSince(baseline, order), [baseline, order]);

  // -- sliding into place (FLIP) -----------------------------------------------
  // Measured against the list's own top, so scrolling, the Now playing banner
  // appearing, or the page reflowing above it is not mistaken for movement.
  const list = useRef<HTMLOListElement>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const origin = list.current?.getBoundingClientRect().top ?? 0;
    const next = new Map<string, number>();
    rows.current.forEach((el, id) => {
      const top = el.getBoundingClientRect().top - origin;
      next.set(id, top);
      const before = tops.current.get(id);
      if (reduce || before === undefined || before === top) return;
      el.style.transition = "none";
      el.style.transform = `translateY(${before - top}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform 400ms cubic-bezier(0.2, 0.8, 0.2, 1)";
        el.style.transform = "";
      });
    });
    tops.current = next;
  }, [order]);

  // -- now playing --------------------------------------------------------------
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const playing = nowPlayingId(songs, now);
  const playingSong = playing ? byId.get(playing) : undefined;

  const [expanded, setExpanded] = useState(false);

  if (songs.length === 0) return null;

  const visible = order.filter((id) => byId.has(id));
  const shown = expanded ? visible : visible.slice(0, CHART_TOP);

  return (
    <div className="mt-10" onPointerDown={touched} onWheel={touched} onTouchMove={touched}>
      <div className="flex items-baseline justify-between gap-3">
        <Label>What everyone&rsquo;s picked</Label>
        <span className="text-[0.85rem] text-muted tabular-nums">
          {live ? <span aria-hidden="true" className="song-live-dot mr-1.5 inline-block" /> : null}
          {visible.length} {visible.length === 1 ? "song" : "songs"}
          {live ? " · live" : ""}
        </span>
      </div>

      {playingSong ? (
        <div className="mt-4 flex items-center gap-3 border border-accent px-4 py-3" aria-live="polite">
          <Art src={playingSong.art} />
          <div className="min-w-0">
            <p className="site-label text-accent">♪ Now playing</p>
            <p className="truncate text-[1.0625rem] text-ink">
              {playingSong.title}
              {playingSong.artist ? <span className="italic text-muted"> · {playingSong.artist}</span> : null}
            </p>
          </div>
        </div>
      ) : null}

      <ol ref={list} className="mt-5 border-t border-line">
        {shown.map((id, index) => {
          const song = byId.get(id)!;
          const view = local[id] ?? { votes: song.votes, voted: song.votedByViewer };
          return (
            <li
              key={id}
              ref={(el) => {
                if (el) rows.current.set(id, el);
                else rows.current.delete(id);
              }}
              className={`flex items-center gap-3 border-b border-line py-3.5 ${
                index === 2 && shown.length > 3 ? "border-b-2 border-b-ink/30" : ""
              }`}
            >
              <span
                className={`w-6 shrink-0 text-right tabular-nums ${index < 3 ? "text-[1.15rem] text-ink" : "text-muted"}`}
              >
                {index + 1}
              </span>
              <Move move={moves.get(id) ?? null} />
              <Art src={song.art} />
              <div className="min-w-0 flex-1">
                <p className={`text-ink ${index < 3 ? "text-[1.125rem]" : "text-[1.0625rem]"}`}>
                  {song.title}
                  {song.artist ? <span className="italic text-muted"> · {song.artist}</span> : null}
                  {song.hot ? (
                    <span className="ml-2 whitespace-nowrap text-[0.85rem]" title="Most votes in the last two days">
                      🔥<span className="sr-only"> Hot</span>
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 flex flex-wrap gap-x-3">
                  {song.couplesPick ? <Label className="text-accent">♥ Couple&rsquo;s pick</Label> : null}
                  {song.playedAt ? (
                    <Label>
                      {song.askedByViewer ? "Your song was played" : "♪ Played"} · {formatTime(song.playedAt, timeZone)}
                    </Label>
                  ) : song.askedByViewer ? (
                    // Theirs, said so — not "Added by <their own name>", which is
                    // the same fact in the third person.
                    <Label>Your suggestion</Label>
                  ) : song.askedBy ? (
                    <Label>Added by {song.askedBy}</Label>
                  ) : null}
                </p>
              </div>

              {canVote ? (
                // An explicit upvote, not a star: a star reads as a rating or a
                // favourite, and nobody knew it was a vote (spec 28 §6.2). The
                // word is dropped on a phone, where the arrow and the count
                // carry it and the row keeps its room.
                <button
                  type="button"
                  onClick={() => onVote(song)}
                  aria-pressed={view.voted}
                  aria-label={`${view.voted ? "Take back your vote for" : "Vote for"} ${song.title}`}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[0.9rem] transition-colors ${
                    view.voted
                      ? "border-accent bg-accent text-paper"
                      : "border-line text-muted hover:border-ink hover:text-ink"
                  }`}
                >
                  <span aria-hidden="true">▲</span>
                  {/* Keyed by the number so a change re-mounts it and plays the tick. */}
                  <span key={view.votes} className="song-tick tabular-nums">
                    {view.votes}
                  </span>
                  <span aria-hidden="true" className="hidden sm:inline">
                    {view.voted ? "Voted" : "Vote"}
                  </span>
                </button>
              ) : (
                <span className="shrink-0 border border-transparent px-4 py-2 text-[0.95rem] text-muted">
                  <span aria-hidden="true">▲</span>{" "}
                  <span key={view.votes} className="song-tick tabular-nums">
                    {view.votes}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {visible.length > CHART_TOP ? (
        <button
          type="button"
          onClick={() => setExpanded((was) => !was)}
          className="mt-4 text-[0.9rem] text-muted underline underline-offset-4 hover:text-ink"
        >
          {expanded ? "Show the top ten" : `Show all ${visible.length}`}
        </button>
      ) : null}

      {!canVote ? (
        <p className="mt-4 text-[0.9rem] italic text-muted">
          Voting needs your own invitation link — the one in your invitation.
        </p>
      ) : null}
    </div>
  );
}

function Move({ move }: { move: Movement }) {
  if (!move) return <span className="w-9 shrink-0" aria-hidden="true" />;
  if (move.kind === "new") {
    return <span className="w-9 shrink-0 text-[0.7rem] uppercase tracking-[0.1em] text-accent">New</span>;
  }
  return (
    <span
      className={`w-9 shrink-0 text-[0.8rem] tabular-nums ${move.kind === "up" ? "text-accent" : "text-muted"}`}
      aria-label={`${move.kind === "up" ? "Up" : "Down"} ${move.by} since you last looked`}
    >
      {move.kind === "up" ? "▲" : "▼"}
      {move.by}
    </span>
  );
}

/**
 * An album cover, through our own proxy, or a plain ♪ tile for a song typed in
 * by hand. `referrerPolicy` is belt and braces: the address is ours anyway.
 */
export function Art({ src, size = 40 }: { src: string | null; size?: number }) {
  if (!src) {
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size }}
        className="inline-flex shrink-0 items-center justify-center bg-accent/15 text-accent"
      >
        ♪
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- already a sized proxy; next/image would proxy it twice
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="shrink-0 object-cover"
      style={{ width: size, height: size }}
    />
  );
}
