"use client";

import { useState, useTransition } from "react";
import { signGuestbook } from "@/server/actions/guestbook";
import { Label } from "./section";
import type { PublicNote } from "@/server/queries/site-extras";

/**
 * The guestbook, as a guest sees it (spec 25 §12).
 *
 * The prompt inside the empty box does more work than anything else here: "a
 * wish, a memory, a blessing" produces a sentence, and a blank box with
 * "Message" over it produces "Congratulations!".
 *
 * A note left from a household's own link appears immediately; one from the
 * shared address is queued and the form SAYS SO rather than pretending it
 * published. Somebody who thinks they have signed a guestbook and has not will
 * tell people to go and look for it.
 */
const LIMIT = 500;

export function Guestbook({
  weddingSlug,
  token,
  prompt,
  notes,
}: {
  weddingSlug: string;
  /** Present on a household's own page; absent on the shared site. */
  token: string | null;
  prompt: string | null;
  notes: PublicNote[];
}) {
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [done, setDone] = useState<null | { published: boolean }>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await signGuestbook({
        weddingSlug,
        token,
        body,
        authorName: name || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(result.data);
      setBody("");
      setName("");
    });
  }

  return (
    <div className="space-y-10">
      {done ? (
        <p className="text-[1.0625rem] italic text-ink">
          {done.published
            ? "Thank you — it's on the page."
            : "Thank you. We'll read it before it goes up."}
        </p>
      ) : (
        <div>
          <Label>Your note</Label>
          <textarea
            className="mt-2 w-full border border-line bg-[color-mix(in_srgb,var(--site-ink)_3%,var(--site-paper))] p-4 text-[1.0625rem] leading-relaxed text-ink outline-none placeholder:italic placeholder:text-muted focus:border-accent"
            rows={5}
            maxLength={LIMIT}
            value={body}
            placeholder={prompt ?? "Write something the couple will read on a slow afternoon in twenty years…"}
            onChange={(event) => setBody(event.target.value)}
          />

          {/* Only asked for when we do not already know: somebody on their own
              link has a name on their note without typing one. */}
          {!token ? (
            <input
              className="mt-3 w-full border border-line bg-transparent p-3 text-[1rem] text-ink outline-none placeholder:italic placeholder:text-muted focus:border-accent"
              value={name}
              maxLength={80}
              placeholder="Your name"
              onChange={(event) => setName(event.target.value)}
            />
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-4">
            <Label>
              {body.length}/{LIMIT}
            </Label>
            <button
              type="button"
              className="border border-ink px-6 py-3 text-[0.95rem] text-ink transition-colors hover:bg-ink hover:text-paper disabled:opacity-40"
              disabled={pending || body.trim().length === 0}
              onClick={submit}
            >
              {pending ? "Signing…" : "Sign the book"}
            </button>
          </div>
          {error ? <p className="mt-2 text-[0.95rem] text-muted">{error}</p> : null}
        </div>
      )}

      {notes.length > 0 ? (
        <div>
          <Label>Notes from other guests</Label>
          <ul className="mt-5 divide-y divide-line border-t border-line">
            {notes.map((note) => (
              <li key={note.id} className="py-5">
                <p className="whitespace-pre-line text-[1.0625rem] italic leading-relaxed text-ink">
                  &ldquo;{note.body}&rdquo;
                </p>
                {note.authorName ? (
                  <p className="mt-2">
                    <Label>{note.authorName}</Label>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
