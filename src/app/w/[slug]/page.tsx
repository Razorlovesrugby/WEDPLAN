import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { body, script } from "@/lib/fonts";
import { loadSite } from "@/server/queries/site";
import { themeCssVars } from "@/lib/theme/presets";
import {
  NO_COUNTS,
  navItems,
  resolveSections,
  text,
  type SectionKey,
} from "@/lib/site/sections";
import { formatDate, daysUntil } from "@/lib/format";
import { SiteNav } from "@/components/site/site-nav";
import { SiteSection } from "@/components/site/section";
import { SiteHero } from "@/components/site/hero";
import { Countdown } from "@/components/site/countdown";
import { Monogram } from "@/components/site/monogram";
import { FloralRule } from "@/components/site/rule";
import { Faq, Party, Prose, RsvpPointer, Schedule, Story, ThingsToDo } from "@/components/site/content";
import { PublicBoardView } from "@/components/moodboards/public-board";
import { CoachSection, StaysList, TransportList } from "@/components/site/travel-sections";
import { getPublicTravel } from "@/server/queries/travel";
import { getPublicGallery } from "@/server/queries/gallery";
import { GalleryGrid } from "@/components/site/gallery";

/**
 * The public site (spec 14).
 *
 * Server-rendered from `site_content` blocks in the wedding's chosen theme.
 * One scrolling page with a jump nav — Aisle's own layout, and the right
 * default, because a guest on a phone will not navigate.
 *
 * `noindex` stays on. A wedding site turning up in search results for the
 * couple's names is a decision, not an accident (§11, Q8).
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await loadSite(slug);
  return {
    title: site?.wedding.name ?? "Wedding",
    robots: { index: false, follow: false },
  };
}

export default async function PublicSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await loadSite(slug);
  if (!site) notFound();

  const { wedding, theme, blocks, events, boards } = site;
  const [travel, gallery] = await Promise.all([
    getPublicTravel(wedding.id),
    getPublicGallery(wedding.id),
  ]);

  const sections = resolveSections(blocks, {
    ...NO_COUNTS,
    events: events.length,
    boards: boards.length,
    travelOptions: travel.runs.length + travel.transport.length,
    stays: travel.stays.length,
    galleryImages: gallery.length,
  });

  const payloadFor = (key: SectionKey) =>
    sections.find((section) => section.key === key)?.payload ?? null;

  const hero = payloadFor("hero");
  const footer = payloadFor("footer");
  const countdown = payloadFor("countdown");

  const headline = text(hero, "headline") ?? wedding.name;
  const dateLabel =
    text(hero, "date_label") ??
    (wedding.wedding_date ? formatDate(wedding.wedding_date, wedding.timezone) : null);

  const showCountdown = sections.some((section) => section.key === "countdown");
  const countdownDays = wedding.wedding_date ? daysUntil(wedding.wedding_date) : null;

  const monogramName = theme.monogram ? wedding.name : null;
  const nav = navItems(sections);

  return (
    // The theme's five tokens are set here as CSS custom properties, so every
    // `text-muted` / `border-line` / `bg-paper` below this element — shared
    // components like the moodboard grid included — resolves to this wedding's
    // palette rather than the planner's. React sets them as real style
    // properties; nothing is parsed as CSS text.
    <div
      style={themeCssVars(theme)}
      className={`site-print ${script.variable} ${body.variable} min-h-screen bg-paper font-body text-ink antialiased`}
    >
      {nav.length > 0 ? (
        <SiteNav
          items={nav}
          rsvpLabel="RSVP"
          monogram={<Monogram name={monogramName} />}
        />
      ) : null}

      <SiteHero
        style={theme.heroStyle}
        headline={headline}
        dateLabel={dateLabel}
        location={text(hero, "location")}
        imagePath={text(hero, "image_path")}
        imageAlt={text(hero, "image_alt")}
        monogramName={monogramName}
      />

      {showCountdown && countdownDays !== null && wedding.wedding_date ? (
        <Countdown
          weddingDate={wedding.wedding_date}
          initialDays={countdownDays}
          label={text(countdown, "label")}
        />
      ) : null}

      <main>
        {sections.map((section) => {
          const { key, payload, def } = section;
          switch (key) {
            // Rendered outside <main>, above.
            case "hero":
            case "countdown":
            case "footer":
              return null;

            case "story":
              return (
                <SiteSection key={key} id={key} heading={def.label}>
                  <Story payload={payload} />
                </SiteSection>
              );

            case "schedule":
              return (
                <SiteSection key={key} id={key} heading={def.label} intro={text(payload, "intro")}>
                  <Schedule
                    events={events}
                    payload={payload}
                    timeZone={wedding.timezone}
                    invitedEventIds={null}
                  />
                </SiteSection>
              );

            case "travel": {
              // `body` is V1's original free-text payload, kept so a site
              // already carrying one does not lose its words on upgrade.
              const prose = text(payload, "intro") ?? text(payload, "body");
              return (
                <SiteSection key={key} id={key} heading={def.label}>
                  <div className="space-y-10">
                    {prose ? <Prose body={prose} /> : null}
                    <CoachSection
                      runs={travel.runs}
                      timeZone={wedding.timezone}
                      bookable={false}
                    />
                    <TransportList options={travel.transport} />
                  </div>
                </SiteSection>
              );
            }

            case "stays": {
              const prose = text(payload, "intro");
              return (
                <SiteSection key={key} id={key} heading={def.label}>
                  <div className="space-y-10">
                    {prose ? <Prose body={prose} /> : null}
                    <StaysList stays={travel.stays} />
                  </div>
                </SiteSection>
              );
            }

            case "gallery":
              return (
                <SiteSection key={key} id={key} heading={def.label} intro={text(payload, "intro")}>
                  <div className="space-y-10">
                    <GalleryGrid images={gallery} />
                    {boards.map((board) => (
                      <div key={board.board.id}>
                        {board.board.description ? (
                          <p className="mb-4 whitespace-pre-line text-[0.95rem] text-muted">
                            {board.board.description}
                          </p>
                        ) : null}
                        <PublicBoardView board={board} />
                      </div>
                    ))}
                  </div>
                </SiteSection>
              );

            case "party":
              return (
                <SiteSection key={key} id={key} heading={def.label} intro={text(payload, "intro")}>
                  <Party payload={payload} />
                </SiteSection>
              );

            case "things_to_do":
              return (
                <SiteSection key={key} id={key} heading={def.label} intro={text(payload, "intro")}>
                  <ThingsToDo payload={payload} />
                </SiteSection>
              );

            case "faq":
              return (
                <SiteSection key={key} id={key} heading={def.label} intro={text(payload, "intro")}>
                  <Faq payload={payload} />
                </SiteSection>
              );

            case "rsvp":
              return (
                <SiteSection key={key} id={key} heading={def.label}>
                  <RsvpPointer payload={payload} />
                </SiteSection>
              );
          }
        })}
      </main>

      <footer id="footer" className="px-5 pb-16 pt-6">
        <div className="mx-auto max-w-2xl text-center">
          <FloralRule className="mb-8" />
          {theme.monogram ? (
            <Monogram name={monogramName} className="mb-4 block text-2xl text-muted" />
          ) : null}
          {text(footer, "note") ? (
            <p className="text-[1.0625rem] text-muted">{text(footer, "note")}</p>
          ) : null}
          {text(footer, "contact_email") ? (
            <p className="mt-2 text-[0.95rem]">
              <a
                className="text-accent underline underline-offset-2"
                href={`mailto:${text(footer, "contact_email")}`}
              >
                {text(footer, "contact_email")}
              </a>
            </p>
          ) : null}
          {text(footer, "hashtag") ? (
            <p className="mt-2 text-[0.95rem] text-muted">{text(footer, "hashtag")}</p>
          ) : null}
          <p className="mt-6">
            <Link className="text-[0.85rem] text-muted underline underline-offset-2" href="/privacy">
              Privacy
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
