import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { body, script } from "@/lib/fonts";
import { loadSite } from "@/server/queries/site";
import { resolveHouseholdAddress } from "@/server/rsvp/address";
import { resolveCardByAddress } from "@/server/rsvp/card";
import { resolveInvitation } from "@/server/rsvp/resolve";
import { householdPath } from "@/lib/site/household-slug";
import { themeCssVars } from "@/lib/theme/presets";
import { NO_COUNTS, flag, resolveSections, text, type SectionKey } from "@/lib/site/sections";
import { formatDate, daysUntil } from "@/lib/format";
import { SiteHero } from "@/components/site/hero";
import { SiteSection } from "@/components/site/section";
import { Countdown } from "@/components/site/countdown";
import { Monogram } from "@/components/site/monogram";
import { FloralRule } from "@/components/site/rule";
import { Faq, Schedule } from "@/components/site/content";
import { OnTheDay } from "@/components/site/on-the-day";
import { CoachBooking } from "@/components/site/coach-booking";
import { GuestUploader } from "@/components/site/guest-uploader";
import { PublicBoardView } from "@/components/moodboards/public-board";
import { RsvpForm } from "@/components/rsvp/rsvp-form";
import { listPublishedBoards } from "@/server/moodboards/resolve";
import { getHouseholdSeats, getPublicTravel } from "@/server/queries/travel";
import { getGallerySettings, getHouseholdUploads } from "@/server/queries/gallery";

/**
 * One household's own page (spec 21).
 *
 *     /w/ray-and-olivia/okonkwo-4f7ak
 *
 * This is the wedding site with the guest's name on it: the couple's hero and
 * countdown at the top, then only the events this household is invited to,
 * the notes for those events, and the RSVP form. It is what `/i/<token>` and
 * `/rsvp/<token>` used to be, at an address that says whose it is — both of
 * those now redirect here (Q6).
 *
 * **The suffix is doing the security work, not the route.** Everything below
 * is scoped to the one household the address resolved to, and the token it
 * carries is the same credential the actions have always taken. No action
 * signature changed for this feature: the page hands `token` to `RsvpForm`,
 * `CoachBooking` and `GuestUploader` exactly as the old page did.
 */

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string; household: string }>;

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
        {
          url: `/w/${slug}/${household}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: title,
        },
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

export default async function HouseholdSitePage({ params }: { params: Params }) {
  const { slug, household: segment } = await params;

  const site = await loadSite(slug);
  if (!site) notFound();

  const resolved = await resolveHouseholdAddress(site.wedding.id, segment);

  // An address they were given before it was edited (Q4). 308 rather than a
  // rendered page, so the browser and anything that scraped the old link both
  // learn the new one.
  if (resolved.kind === "redirect") {
    permanentRedirect(householdPath(slug, resolved.to));
  }
  if (resolved.kind !== "ok") {
    return <Unavailable throttled={resolved.kind === "throttled"} />;
  }

  const { wedding, theme, blocks, boards: siteBoards } = site;
  const { household, token } = resolved;

  // The token still loads the RSVP context, unchanged since spec 14 — this is
  // the same household, reached by its other spelling.
  const invitation = token ? await resolveInvitation(token) : null;
  const context = invitation?.ok ? invitation.context : null;

  const [travel, seats, uploads, galleryBlock, rsvpBoards] = await Promise.all([
    getPublicTravel(wedding.id),
    getHouseholdSeats(wedding.id, household.id),
    getHouseholdUploads(wedding.id, household.id),
    getGallerySettings(wedding.id),
    listPublishedBoards(wedding.id, "rsvp"),
  ]);

  const sections = resolveSections(blocks, { ...NO_COUNTS, boards: siteBoards.length });
  const payloadFor = (key: SectionKey) =>
    sections.find((section) => section.key === key)?.payload ?? null;

  const hero = payloadFor("hero");
  const headline = text(hero, "headline") ?? wedding.name;
  const dateLabel =
    text(hero, "date_label") ??
    (wedding.wedding_date ? formatDate(wedding.wedding_date, wedding.timezone) : null);
  const monogramName = theme.monogram ? wedding.name : null;

  const showCountdown = sections.some((section) => section.key === "countdown");
  const countdownDays = wedding.wedding_date ? daysUntil(wedding.wedding_date) : null;

  const events = context?.events ?? [];
  const uploadsOpen = flag(galleryBlock, "uploads_open");
  const moderated =
    !(typeof galleryBlock === "object" && galleryBlock !== null && !Array.isArray(galleryBlock)
      ? (galleryBlock as Record<string, unknown>)["moderation"] === "auto"
      : false);

  return (
    <div
      style={themeCssVars(theme)}
      className={`site-print ${script.variable} ${body.variable} min-h-screen bg-paper font-body text-ink antialiased`}
    >
      <SiteHero
        style={theme.heroStyle}
        headline={headline}
        dateLabel={dateLabel}
        location={text(hero, "location")}
        imagePath={text(hero, "image_path")}
        imageAlt={text(hero, "image_alt")}
        monogramName={monogramName}
      />

      {/* Whose page this is. The one line that makes the address true. */}
      <p className="px-5 pt-10 text-center text-[0.78rem] uppercase tracking-[0.2em] text-muted">
        {household.display_name}
      </p>

      {showCountdown && countdownDays !== null && wedding.wedding_date ? (
        <Countdown
          weddingDate={wedding.wedding_date}
          initialDays={countdownDays}
          label={text(payloadFor("countdown"), "label")}
        />
      ) : null}

      <main>
        {events.length > 0 ? (
          <SiteSection id="schedule" heading="You're invited to">
            <Schedule
              events={events}
              payload={payloadFor("schedule")}
              timeZone={wedding.timezone}
              // Every event listed here is one they are invited to, so there
              // is nothing to mark as not-theirs.
              invitedEventIds={null}
            />
          </SiteSection>
        ) : null}

        {events.some((event) => event.guest_note?.trim()) ? (
          <SiteSection id="on-the-day" heading="On the day">
            <OnTheDay events={events} timeZone={wedding.timezone} />
          </SiteSection>
        ) : null}

        <SiteSection
          id="rsvp"
          heading="Will you be there?"
          intro={
            context && !context.locked && context.wedding.rsvp_lock_at
              ? `Please reply by ${formatDate(context.wedding.rsvp_lock_at, wedding.timezone)}. You can change your answers until then.`
              : null
          }
        >
          {context && token ? (
            <RsvpForm
              token={token}
              guests={context.guests}
              events={context.events}
              questions={context.questions}
              rsvps={context.rsvps}
              answers={context.answers}
              locked={context.locked}
            />
          ) : (
            // Every household has an address from the moment it exists (Q8),
            // so this page can be opened before an invitation has been issued
            // — or after the pepper was rotated. Better than a 404 on a link
            // the planner has just copied.
            <p className="text-center text-[1.0625rem] text-muted">
              We haven&rsquo;t sent your invitation yet — it&rsquo;s on its way, and this is where
              you&rsquo;ll reply when it arrives.
            </p>
          )}
        </SiteSection>

        {token && travel.runs.length > 0 ? (
          <SiteSection
            id="coach"
            heading="The coach"
            intro="Tell us if you'd like seats and where you'll get on. You can change this any time — it's a reservation, not a payment."
          >
            <CoachBooking
              token={token}
              runs={travel.runs}
              held={Object.fromEntries(
                [...seats.entries()].map(([runId, seat]) => [
                  runId,
                  { coach_stop_id: seat.coach_stop_id, seats: seat.seats },
                ]),
              )}
              timeZone={wedding.timezone}
            />
          </SiteSection>
        ) : null}

        {payloadFor("faq") ? (
          <SiteSection id="faq" heading="Questions" intro={text(payloadFor("faq"), "intro")}>
            <Faq payload={payloadFor("faq")} />
          </SiteSection>
        ) : null}

        {token && uploadsOpen ? (
          <SiteSection
            id="photos"
            heading="Photos"
            intro={
              text(galleryBlock, "intro") ??
              "If you took anything you'd like us to have, add it here."
            }
          >
            <GuestUploader token={token} mine={uploads} moderated={moderated} />
          </SiteSection>
        ) : null}

        {/* Moodboards published to the RSVP channel — "what do I wear" gets
            asked by someone already standing here. */}
        {rsvpBoards.map((board) => (
          <SiteSection key={board.board.id} id={`board-${board.board.id}`} heading={board.board.title}>
            {board.board.description ? (
              <p className="mb-6 whitespace-pre-line text-[0.95rem] text-muted">
                {board.board.description}
              </p>
            ) : null}
            <PublicBoardView board={board} />
          </SiteSection>
        ))}
      </main>

      <footer className="px-5 py-16 text-center">
        <FloralRule className="mb-8" />
        {monogramName ? <Monogram name={monogramName} className="block text-2xl text-muted" /> : null}
        <p className="mt-6 text-[0.95rem] text-muted">
          Travel, where to stay, our story and the rest of it are{" "}
          <Link href={`/w/${wedding.slug}`} className="text-accent underline underline-offset-2">
            on the main site
          </Link>
          .
        </p>
        <p className="mt-4 text-[0.85rem] text-muted">
          This page is yours — there&rsquo;s no account to create. Please don&rsquo;t forward it;
          everyone else has their own.
        </p>
        <p className="mt-2 text-[0.85rem] text-muted">
          <Link className="underline hover:text-accent" href="/privacy">
            What happens to what you enter here
          </Link>
        </p>
      </footer>
    </div>
  );
}
