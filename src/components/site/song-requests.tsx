"use client";

import { useState, useTransition } from "react";
import { requestSong } from "@/server/actions/songs";

/**
 * The song request form (spec 23 §8, Q2).
 *
 * Open to anyone with the site address, which is a decision with a cost: a
 * form on a public URL is a form the internet can find. So the name field is
 * optional and is a *name*, not an identity; the write is rate-limited
 * server-side; and **nothing anybody types here is rendered back onto this
 * page**. The list is the planner's, and that is what keeps an open form from
 * becoming a billboard.
 *
 * A request sent from a household's own page carries their token, so the
 * common case is attributed without anybody typing anything.
 */
export function SongRequestForm({
  weddingSlug,
  token,
  intro,
}: {
  weddingSlug: string;
  /** Present on a household's own page; absent on the shared site. */
  token: string | null;
  intro: string | null;
}) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [askedBy, setAskedBy] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;

    startTransition(async () => {
      const result = await requestSong({
        weddingSlug,
        token,
        title,
        artist,
        askedBy,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setSent((was) => [...was, [title.trim(), artist.trim()].filter(Boolean).join(" · ")]);
      setTitle("");
      setArtist("");
    });
  }

  return (
    <div className="mx-auto max-w-lg">
      {intro ? <p className="mb-6 text-center text-[1.0625rem] text-muted">{intro}</p> : null}

      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[0.9rem] text-muted">Song</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={200}
            placeholder="Dancing Queen"
            className="w-full border border-line bg-white p-2 text-[1rem]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[0.9rem] text-muted">Artist (optional)</span>
          <input
            value={artist}
            onChange={(event) => setArtist(event.target.value)}
            maxLength={200}
            placeholder="ABBA"
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

        <button
          type="submit"
          disabled={pending || title.trim().length === 0}
          className="border border-accent px-5 py-2 text-[0.72rem] uppercase tracking-[0.14em] text-accent hover:bg-accent hover:text-paper disabled:opacity-50"
        >
          Add it to the list
        </button>
      </form>

      {/* Only what this visitor added, in this tab. Never the list itself:
          that belongs to the couple. */}
      {sent.length > 0 ? (
        <div className="mt-6 text-[0.95rem] text-muted">
          <p>Thank you — we&rsquo;ve got:</p>
          <ul className="mt-1 space-y-0.5">
            {sent.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-[0.95rem] text-red-700">{error}</p> : null}
    </div>
  );
}
