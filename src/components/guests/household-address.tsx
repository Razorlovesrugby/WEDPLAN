"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setHouseholdSlug } from "@/server/actions/guests";
import { formatAddress, householdPath, householdSlugify } from "@/lib/site/household-slug";

/**
 * A household's own page, on the household screen (spec 21 §6).
 *
 * The planner asked for a "create custom slug" button here. There is nothing
 * to create — every household has an address from the moment it exists (Q8) —
 * so this shows it, copies it, edits it and previews it instead.
 *
 * Only the readable half is editable. The five characters after it are the
 * credential, and the copy says so, because "it looks like junk, let me tidy
 * it up" is exactly the instinct that would otherwise turn a link into a
 * guessable one.
 */
export function HouseholdAddress({
  weddingSlug,
  householdId,
  displayName,
  slug,
  suffix,
  hasInvitation,
}: {
  weddingSlug: string;
  householdId: string;
  displayName: string;
  slug: string;
  suffix: string;
  hasInvitation: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(slug);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const path = householdPath(weddingSlug, { slug, suffix });
  // The origin is the browser's, so this is the link that actually works from
  // wherever the planner is — a preview deployment included.
  const fullUrl = typeof window === "undefined" ? path : `${window.location.origin}${path}`;

  const suggestion = householdSlugify(displayName);
  const suggestable = suggestion !== slug;

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setMessage("Link copied");
      setError(null);
    } catch {
      setError("Couldn't copy — select the link and copy it by hand.");
    }
  }

  function save(next: string) {
    startTransition(async () => {
      const result = await setHouseholdSlug(householdId, next);
      if (!result.ok) {
        setError(result.error);
        setMessage(null);
        return;
      }
      setError(null);
      setMessage("Address updated — the old link still works");
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <section className="card p-4">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Their page</h2>

      <p className="mt-2 break-all font-mono text-sm text-ink">{path}</p>

      {!hasInvitation ? (
        <p className="mt-2 text-sm text-muted">
          This link works now, but it can&rsquo;t take an RSVP until they have an invitation.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={copy}>
          Copy link
        </button>
        {/* ?preview=1 keeps the planner's own look at the page out of the
            open count (spec 22 §9). */}
        <Link href={`${path}?preview=1`} target="_blank" className="btn">
          Preview as them
        </Link>
        <button type="button" className="btn" onClick={() => setEditing((open) => !open)}>
          {editing ? "Cancel" : "Edit address"}
        </button>
      </div>

      {editing ? (
        <form
          className="mt-4 border-t border-line pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            save(draft);
          }}
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium">The readable part</span>
            <div className="flex items-center gap-1">
              <span className="whitespace-nowrap text-sm text-muted">/w/{weddingSlug}/</span>
              <input
                className="field flex-1"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                autoFocus
              />
              <span className="whitespace-nowrap text-sm text-muted">-{suffix}</span>
            </div>
          </label>

          <p className="mt-2 text-sm text-muted">
            The {suffix.length} characters on the end stay as they are — they&rsquo;re what stops
            anyone who can guess a surname opening this page. To change those, reissue the
            invitation.
          </p>

          {suggestable ? (
            <p className="mt-2 text-sm text-muted">
              From their name:{" "}
              <button
                type="button"
                className="underline hover:text-accent"
                onClick={() => setDraft(suggestion)}
              >
                {suggestion}
              </button>
            </p>
          ) : null}

          <p className="mt-2 text-sm text-muted">
            Preview: <span className="font-mono">{formatAddress({ slug: draft || slug, suffix })}</span>
          </p>

          <div className="mt-3 flex gap-2">
            <button type="submit" className="btn-primary" disabled={pending}>
              Save address
            </button>
          </div>
        </form>
      ) : null}

      {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
