import type { Metadata } from "next";
import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import { addressForToken } from "@/server/rsvp/address";
import { householdPath } from "@/lib/site/household-slug";

/**
 * The RSVP page, retired into a redirect (spec 21 Q6).
 *
 * Everything this page rendered — the household's name, their events, the
 * form, the questions, the coach, the photo uploads — now lives at
 * `/w/<wedding>/<slug>-<suffix>` in the wedding's own theme.
 *
 * The token is still a working credential: the address resolves to the same
 * household and hands the same token to the same server actions, and every
 * invitation sent before this feature existed points here. That is why this
 * is a redirect rather than a deletion, and why it will stay one.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "RSVP",
  // A guest list is not for search engines, whatever the token.
  robots: { index: false, follow: false, nocache: true },
};

export default async function RsvpRedirect({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = await addressForToken(token);

  if (!target) {
    return (
      <main className="mx-auto max-w-lg px-6 py-20">
        <h1 className="font-serif text-2xl">We can&rsquo;t find that invitation</h1>
        <p className="mt-3 text-sm text-muted">
          {/* Deliberately the same message whether the token is malformed or
              simply unknown: distinguishing them would confirm which tokens
              exist. */}
          The link may have been mistyped, or replaced with a newer one. Check the most recent
          message from the couple, or ask them to resend it.
        </p>
        <p className="mt-6 text-sm text-muted">
          <Link className="underline hover:text-accent" href="/privacy">
            What happens to what you enter here
          </Link>
        </p>
      </main>
    );
  }

  permanentRedirect(householdPath(target.weddingSlug, target.address));
}
