import type { Metadata } from "next";
import { loadOwnClaim } from "@/server/actions/registry-public";
import { registryColourVars } from "@/lib/registry/look";
import { registryFonts } from "@/lib/registry/fonts";
import { OwnClaimView } from "@/components/registry/public/own-claim";

/**
 * A buyer's private page (spec 36 §6.3): their own claim, the delivery address,
 * and the way to undo it. Reached only by the unguessable token they were shown
 * once. The token is looked up by hash; anything unknown, malformed or released
 * long ago renders the same page, so it can't be used to ask what exists.
 *
 * Read-only on load: the release is a button press (a link scanner fetching
 * this URL must not undo anybody's gift).
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your gift", robots: { index: false, follow: false } };

export default async function OwnClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claim = await loadOwnClaim(token);

  if (!claim) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="font-serif text-2xl">This link isn&rsquo;t active</h1>
        <p className="mt-2 text-sm text-muted">It may have been mistyped. If you meant to find the registry, ask the couple for their link.</p>
      </main>
    );
  }

  const fonts = registryFonts(claim.pairing);
  return (
    <div
      data-registry
      className={`${fonts.className} min-h-screen bg-paper font-body text-ink`}
      style={{ ...registryColourVars(claim.palette), ...fonts.vars } as React.CSSProperties}
    >
      <main className="mx-auto max-w-xl px-5 py-12">
        <OwnClaimView token={token} claim={claim} />
      </main>
    </div>
  );
}
