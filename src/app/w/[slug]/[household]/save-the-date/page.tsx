import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { siteFontClasses, typographyCssVars } from "@/lib/fonts";
import { findWeddingBySlug } from "@/server/queries/site";
import { getSaveTheDatePhotos } from "@/server/queries/save-the-date";
import { resolveHouseholdAddress } from "@/server/rsvp/address";
import { resolveCardByAddress } from "@/server/rsvp/card";
import { formatAddress } from "@/lib/site/household-slug";
import { saveTheDatePath } from "@/lib/site/save-the-date";
import { splitHeadline } from "@/lib/site/names";
import { themeCssVars } from "@/lib/theme/presets";
import { formatDate } from "@/lib/format";
import { SaveTheDateViewLogger } from "@/components/site/view-logger";

/**
 * A household's save-the-date:
 *
 *     /w/ray-and-olivia/okonkwo-4f7ak/save-the-date
 *
 * The whole of it is one link. Names, the date, where, a few photographs, and
 * "invitation to follow" — nothing to fill in, because a save-the-date asks
 * nothing. It is always set in the Editorial composition, whatever theme the
 * site uses, and takes the site's palette so the two still look related.
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
  const card = await resolveCardByAddress(slug, household);
  const robots = { index: false, follow: false, nocache: true };
  if (!card) return { title: "Save the date", robots };

  const dateLabel =
    card.hero.dateLabel ??
    (card.wedding.wedding_date ? formatDate(card.wedding.wedding_date, card.wedding.timezone) : null);
  const title = `Save the date — ${card.hero.headline ?? card.wedding.name}`;
  const description = [dateLabel, card.hero.location].filter(Boolean).join(" · ") || "Save the date";

  return {
    title,
    description,
    robots,
    // The household page's preview image already carries the names and the
    // date, which is everything a save-the-date says.
    openGraph: {
      title,
      description,
      type: "website",
      images: [
        { url: `/w/${slug}/${household}/opengraph-image`, width: 1200, height: 630, alt: title },
      ],
    },
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

  const [card, photos] = await Promise.all([
    resolveCardByAddress(slug, segment),
    getSaveTheDatePhotos(wedding.id),
  ]);
  if (!card) return <Unavailable throttled={false} />;

  const headline = card.hero.headline ?? wedding.name;
  const split = splitHeadline(headline);
  const dateLabel =
    card.hero.dateLabel ??
    (wedding.wedding_date ? formatDate(wedding.wedding_date, wedding.timezone) : null);
  const location = card.hero.location;
  const [lead, ...rest] = photos;

  return (
    <div
      style={{ ...themeCssVars(card.theme), ...typographyCssVars("editorial", card.theme.typography) }}
      data-site-theme="editorial"
      className={`${siteFontClasses("editorial")} min-h-screen bg-paper font-body text-ink antialiased`}
    >
      {/* Counted from the browser, never from the planner's own preview. */}
      <SaveTheDateViewLogger
        weddingSlug={slug}
        address={formatAddress(resolved.address)}
        enabled={preview !== "1"}
      />

      <main className="mx-auto w-full max-w-5xl px-5 pb-20 pt-14 sm:px-10 sm:pt-24">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 text-muted">
          <p className="site-label site-eyebrow">Save the date</p>
          <p className="site-label site-eyebrow">For {resolved.household.display_name}</p>
        </div>

        <h1 className="site-h1 site-heading mt-10 sm:mt-14">
          {split ? (
            <>
              {split.left}
              <span aria-hidden="true" className="site-h1-amp">
                {split.joiner}
              </span>
              <span className="sr-only"> {split.joiner} </span>
              {split.right}
            </>
          ) : (
            headline
          )}
        </h1>

        <div className="mt-10 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 border-t border-line pt-6">
          {dateLabel ? <p className="site-h3 site-heading">{dateLabel}</p> : null}
          {location ? <p className="site-label site-eyebrow text-muted">{location}</p> : null}
        </div>

        {lead ? (
          <figure className="mt-12 sm:mt-16">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed
                URLs from a private bucket; see blocks/media.tsx. */}
            <img
              src={lead.url}
              alt={lead.alt ?? ""}
              className="aspect-[4/5] w-full object-cover sm:aspect-[16/9]"
            />
          </figure>
        ) : null}

        {rest.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {rest.map((photo) => (
              // eslint-disable-next-line @next/next/no-img-element -- as above
              <img
                key={photo.id}
                src={photo.url}
                alt={photo.alt ?? ""}
                loading="lazy"
                className="aspect-[3/4] w-full object-cover"
              />
            ))}
          </div>
        ) : null}

        <p className="site-intro site-body mt-14 max-w-xl text-muted">
          Nothing to do yet — just keep the day free. The invitation, with all the details, follows
          nearer the time.
        </p>
      </main>
    </div>
  );
}
