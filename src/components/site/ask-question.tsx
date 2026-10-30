"use client";

import { useState, useTransition } from "react";
import { askQuestion } from "@/server/actions/questions-inbox";
import { PREVIEW_NOT_SAVED } from "@/lib/site/preview-guard";

/**
 * The "Ask a question" button under the FAQ. It opens a small form in place;
 * the question goes to the couple only, never onto the page.
 *
 * A guest on their own invitation link is already known, so they are not asked
 * for a name; everyone is asked for an optional way to be answered.
 */
const LIMIT = 1000;

export function AskQuestion({
  weddingSlug,
  token,
  preview = false,
}: {
  weddingSlug: string;
  token: string | null;
  /** The editor's preview: the form works and nothing is sent. */
  preview?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (preview) {
      setError(PREVIEW_NOT_SAVED);
      return;
    }
    startTransition(async () => {
      const result = await askQuestion({
        weddingSlug,
        token,
        body,
        authorName: name || undefined,
        contact: contact || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(true);
      setBody("");
      setName("");
      setContact("");
    });
  }

  if (sent) {
    return (
      <p className="mt-8 text-center text-[1.0625rem] italic text-ink">
        Thank you — we&rsquo;ve got your question and will get back to you.
      </p>
    );
  }

  const field =
    "mt-3 w-full border border-line bg-transparent p-3 text-[1rem] text-ink outline-none placeholder:italic placeholder:text-muted focus:border-accent";

  return (
    <div className="mt-8 text-center">
      {open ? (
        <div className="text-left">
          <textarea
            className="w-full border border-line bg-[color-mix(in_srgb,var(--site-ink)_3%,var(--site-paper))] p-4 text-[1.0625rem] leading-relaxed text-ink outline-none placeholder:italic placeholder:text-muted focus:border-accent"
            rows={4}
            maxLength={LIMIT}
            value={body}
            placeholder="What would you like to know?"
            aria-label="Your question"
            onChange={(event) => setBody(event.target.value)}
          />
          {!token ? (
            <input
              className={field}
              value={name}
              maxLength={80}
              placeholder="Your name"
              aria-label="Your name"
              onChange={(event) => setName(event.target.value)}
            />
          ) : null}
          <input
            className={field}
            value={contact}
            maxLength={200}
            placeholder="Email or phone, if you'd like a reply (optional)"
            aria-label="Email or phone"
            onChange={(event) => setContact(event.target.value)}
          />
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              className="border border-ink px-6 py-3 text-[0.95rem] text-ink transition-colors hover:bg-ink hover:text-paper disabled:opacity-40"
              disabled={pending || body.trim().length === 0}
              onClick={submit}
            >
              {pending ? "Sending…" : "Send question"}
            </button>
          </div>
          {error ? <p className="mt-2 text-[0.95rem] text-muted">{error}</p> : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-block border border-accent px-8 py-3 text-[0.78rem] uppercase tracking-[0.14em] text-accent transition-colors hover:bg-accent hover:text-paper"
        >
          Ask a question
        </button>
      )}
    </div>
  );
}
