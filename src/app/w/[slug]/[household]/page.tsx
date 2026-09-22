import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { siteFontClasses, typographyCssVars } from "@/lib/fonts";
import { findWeddingBySlug } from "@/server/queries/site";
import { loadPublishedBlocks } from "@/server/queries/site-blocks";
import { buildPersonalContext, buildRenderContext } from "@/server/queries/site-render";
import { resolveHouseholdAddress } from "@/server/rsvp/address";
import { resolveCardByAddress } from "@/server/rsvp/card";
import { resolveInvitation } from "@/server/rsvp/resolve";
import { householdPath } from "@/lib/site/household-slug";
import { blockNavItems, visibleBlocks } from "@/lib/site/blocks";
import { listNames } from "@/lib/invites";
import { themeCssVars } from "@/lib/theme/presets";
import { formatDate } from "@/lib/format";
import { SiteNav } from "@/components/site/site-nav";
import { Monogram } from "@/components/site/monogram";
import { SiteBlocks } from "@/components/site/blocks/render";
import { SectionRail } from "@/components/site/section-rail";
import { ReplyBanner } from "@/components/site/reply-banner";
import { ViewLogger } from "@/components/site/view-logger";

/**
 * One household's own page (spec 21, rebuilt onto blocks by spec 23).
 *
 *     /w/ray-and-olivia/okonkwo-4f7ak
 *
 * The same built page as the shared site, personalised in place: the blocks
 * come from the same published revision, and the ones the catalogue marks
 * `personal` render their version of themselves — their events, their RSVP,
 * their notes. That is what makes "the site and the invite are the same
 * thing" true in the code rather than only in the spec.
 *
 * **The suffix is doing the security work, not the route.** Everything below
 * is scoped to the one household the address resolved to, and the token it
 * carries is the same credential the actions have always taken.
 */

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string; household: string }>;
type Search = Promise<{ reply?: string; preview?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, household } = await params;
  const card = await resolveCardByAddress(slug, household);

  // noindex whatever happens. A guest list is not for search engines, and an
  // indexed personal address is a published invitation link.
  if (!card) return { title: "Invitation", robots: { index: false, follow: false } };

  const dateLabel =
    card.hero.dateLabel ??
    (card.wedding.wedding_date ? formatDate(card.wedding.wedding_date, card.wedding.timezone) : null);
  const title = card.hero.headline ?? card.wedding.name;
  const description = [dateLabel, card.hero.location].filter(Boolean).join(" · ") || "You're invited";

  return {
    title,
    description,
    robots: { index: false, follow: false, nocache: true },
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

/** The same neutral answer for a wrong address, a cut household and a flood. */
function Unavailable({ throttled }: { throttled: boolean }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-20">
      <h1 className="font-serif text-2xl">
        {throttled ? "Too many attempts" : "We can't find that invitation"}
      </h1>
      <p className="mt-3 text-sm text-muted">
        {throttled
          ? "Give it a few minutes and try the link again."
          : /* Deliberately identical whether the address is malformed, unknown
               or belongs to a household that has been cut: distinguishing them
               would confirm which households exist. */
            "The link may have been mistyped, or replaced with a newer one. Check the most recent message from the couple, or ask them to resend it."}
      </p>
    </main>
  );
}

export default async function HouseholdSitePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { slug, household: segment } = await params;
  const { reply, preview } = await searchParams;

  const wedding = await findWeddingBySlug(slug);
  if (!wedding) notFound();

  const resolved = await resolveHouseholdAddress(wedding.id, segment);

  // An address they were given before it was edited (spec 21 Q4). 308 rather
  // than a rendered page, so the browser and anything that scraped the old
  // link both learn the new one.
  if (resolved.kind === "redirect") {
    permanentRedirect(householdPath(slug, resolved.to));
  }
  if (resolved.kind !== "ok") {
    return <Unavailable throttled={resolved.kind === "throttled"} />;
  }

  const { household, token } = resolved;

  // The token still loads the RSVP context, unchanged since spec 14 — this is
  // the same household, reached by its other spelling.
  const invitation = token ? await resolveInvitation(token) : null;
  const rsvp = invitation?.ok ? invitation.context : null;

  const personal = await buildPersonalContext(wedding.id, household, token, rsvp);
  const [blocks, ctx] = await Promise.all([
    loadPublishedBlocks(wedding.id),
    buildRenderContext(wedding, personal),
  ]);

  const shown = visibleBlocks(blocks, true);
  const nav = blockNavItems(shown);

  return (
    <div
      style={{ ...themeCssVars(ctx.theme), ...typographyCssVars(ctx.theme.preset, ctx.theme.typography) }}
      // The preset's own name, so `globals.css` can carry everything that
      // separates one theme from another — type scale, alignment, the
      // itinerary grid — without a `preset === "editorial"` branch in a dozen
      // render functions. Adding a fourth preset stays a stylesheet.
      data-site-theme={ctx.theme.preset}
      className={`site-print ${siteFontClasses(ctx.theme.preset)} min-h-screen bg-paper font-body text-ink antialiased`}
    >
      {/* Counted from the browser, and never when the planner is previewing
          (spec 22 §9). */}
      {token ? <ViewLogger token={token} enabled={preview !== "1"} /> : null}

      {nav.length > 0 ? (
        <SiteNav
          items={nav}
          rsvpLabel="RSVP"
          monogram={<Monogram name={ctx.theme.monogram ? wedding.name : null} />}
        />
      ) : null}

      {/* Arrived from the email's Yes or No button (spec 22 §8). The reply is
          applied client-side by this component, never during the render — mail
          scanners fetch every link in a message and would otherwise answer on
          the guest's behalf. */}
      {token && rsvp && !rsvp.locked && (reply === "yes" || reply === "no") ? (
        <ReplyBanner
          token={token}
          reply={reply}
          names={listNames(personal.members.map((member) => member.name))}
        />
      ) : null}

      <SectionRail blocks={shown} />

      <SiteBlocks blocks={shown} ctx={ctx} />

      <p className="px-5 pb-12 text-center text-[0.95rem] text-muted">
        Travel, where to stay and the rest of it are{" "}
        <Link href={`/w/${wedding.slug}`} className="text-accent underline underline-offset-2">
          on the main site
        </Link>
        .
      </p>
    </div>
  );
}
