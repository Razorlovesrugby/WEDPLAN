import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { findWeddingBySlug } from "@/server/queries/site";
import { loadSaveTheDate, loadSaveTheDateContent } from "@/server/queries/save-the-date";
import { resolveHouseholdAddress } from "@/server/rsvp/address";
import { resolveCardByAddress } from "@/server/rsvp/card";
import { formatAddress } from "@/lib/site/household-slug";
import {
  calendarEventTitle,
  googleCalendarUrl,
  saveTheDateDisplay,
  saveTheDateIcsPath,
  saveTheDatePath,
} from "@/lib/site/save-the-date";
import { themeCssVars } from "@/lib/theme/presets";
import { absoluteUrl } from "@/lib/env";
import { SaveTheDateCard } from "@/components/save-the-date/card";
import { SaveTheDateViewLogger } from "@/components/site/view-logger";

/**
 * A household's save-the-date:
 *
 *     /w/ray-and-olivia/okonkwo-4f7ak/save-the-date
 *
 * The whole of it is one link. What it says, which photographs and which
 * layout are designed on `/invitations/save-the-date`; this page only
 * resolves who is reading and renders `SaveTheDateCard`, the same component
 * the editor previews with.
 *
 * Per household so the planner can see who opened it (Guests → "Save the
 * date"). The suffix is the credential, resolved through the same throttled
 * path as the household's invitation page.
 */

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string; household: string }>;
type Search = Promise<{ preview?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, household } = await params;
  // The unthrottled lookup, like the invitation page's metadata: this runs for
  // every link preview a group chat fetches.
  const card = await resolveCardByAddress(slug, household);
  const robots = { index: false, follow: false, nocache: true };
  if (!card) return { title: "Save the date", robots };

  const { content } = await loadSaveTheDateContent(card.wedding.id);
  const display = saveTheDateDisplay(content, card.wedding);
  const title = `${display.eyebrow} — ${display.headline}`;
  const description = [display.dateLabel, display.location].filter(Boolean).join(" · ") || title;

  return {
    title,
    description,
    robots,
    // The image itself is `opengraph-image.tsx` beside this file; Next adds
    // it to both tags on its own.
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

function Unavailable({ throttled }: { throttled: boolean }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-20">
      <h1 className="font-serif text-2xl">
        {throttled ? "Too many attempts" : "We can't find that link"}
      </h1>
      <p className="mt-3 text-sm text-muted">
        {throttled
          ? "Give it a few minutes and try the link again."
          : "The link may have been mistyped, or replaced with a newer one. Check the most recent message from the couple, or ask them to resend it."}
      </p>
    </main>
  );
}

export default async function SaveTheDatePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { slug, household: segment } = await params;
  const { preview } = await searchParams;

  const wedding = await findWeddingBySlug(slug);
  if (!wedding) notFound();

  const resolved = await resolveHouseholdAddress(wedding.id, segment);
  if (resolved.kind === "redirect") permanentRedirect(saveTheDatePath(slug, resolved.to));
  if (resolved.kind !== "ok") return <Unavailable throttled={resolved.kind === "throttled"} />;

  const { content, siteTheme, photos } = await loadSaveTheDate(wedding.id);
  const display = saveTheDateDisplay(content, wedding);
  const palette =
    content.palette === "site" ? siteTheme : { ...siteTheme, palette: content.palette };

  const google = content.showCalendar
    ? googleCalendarUrl({
        title: calendarEventTitle(display.headline),
        weddingDate: wedding.wedding_date,
        location: display.location,
        details: display.message,
      })
    : null;

  return (
    <>
      {/* Counted from the browser, never from the planner's own preview. */}
      <SaveTheDateViewLogger
        weddingSlug={slug}
        address={formatAddress(resolved.address)}
        enabled={preview !== "1"}
      />
      <div className="min-h-screen bg-paper" style={themeCssVars(palette)}>
        <SaveTheDateCard
          display={display}
          greeting={content.showGreeting ? resolved.household.display_name : null}
          photos={photos}
          layout={content.layout}
          colourVars={themeCssVars(palette)}
          typography={siteTheme.typography}
          countdownDate={content.showCountdown ? wedding.wedding_date : null}
          calendar={
            google
              ? // Absolute, on the public address: the phone's calendar fetches
                // this itself, and a relative link on a deployment-specific
                // *.vercel.app page would be sent to Vercel's login instead.
                { icsHref: absoluteUrl(saveTheDateIcsPath(slug)), googleHref: google }
              : null
          }
          animate
        />
      </div>
    </>
  );
}
