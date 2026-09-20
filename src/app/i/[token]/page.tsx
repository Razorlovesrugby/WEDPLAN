import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { addressForToken } from "@/server/rsvp/address";
import { householdPath } from "@/lib/site/household-slug";

/**
 * The stationery card, retired into a redirect (spec 21 Q6).
 *
 * This route was the card you forwarded over WhatsApp. That card is now the
 * top of the household's own page at `/w/<wedding>/<slug>-<suffix>`, which
 * says whose invitation it is in the URL itself — so there is one link per
 * household rather than three surfaces to choose between when sending.
 *
 * The route stays because the old link does not go away: it is in people's
 * chat histories, in already-posted envelopes, and inside printed QR codes
 * that cannot be reissued. A 308 keeps every one of them landing in the right
 * place.
 *
 * Its Open Graph image moved with the card — a redirect is not a preview, and
 * leaving the image behind here would have made every forwarded link render
 * blank. See `/w/[slug]/[household]/opengraph-image.tsx`.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invitation",
  robots: { index: false, follow: false, nocache: true },
};

export default async function InvitationCardRedirect({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const target = await addressForToken(token);

  // An unknown or retired token renders the same neutral page the household
  // address does, rather than redirecting somewhere that would confirm which
  // tokens exist.
  if (!target) {
    return (
      <main className="mx-auto max-w-lg px-6 py-20">
        <h1 className="font-serif text-2xl">We can&rsquo;t find that invitation</h1>
        <p className="mt-3 text-sm text-muted">
          The link may have been mistyped, or replaced with a newer one. Check the most recent
          message from the couple, or ask them to resend it.
        </p>
      </main>
    );
  }

  permanentRedirect(householdPath(target.weddingSlug, target.address));
}
