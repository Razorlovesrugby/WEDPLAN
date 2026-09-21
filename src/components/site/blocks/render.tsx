import Link from "next/link";
import { BLOCKS, type BlockStyle, type SiteBlock } from "@/lib/site/blocks";
import { text } from "@/lib/site/sections";
import { formatDate, daysUntil } from "@/lib/format";
import { SiteHero } from "../hero";
import { SiteSection } from "../section";
import { Countdown } from "../countdown";
import { Monogram } from "../monogram";
import { FloralRule } from "../rule";
import { Faq, Party, Prose, RsvpPointer, Schedule, Story, ThingsToDo } from "../content";
import { InvitedEvents } from "../invited-events";
import { OnTheDay } from "../on-the-day";
import { GalleryGrid } from "../gallery";
import { CoachSection, StaysList, TransportList } from "../travel-sections";
import { CoachBooking } from "../coach-booking";
import { GuestUploader } from "../guest-uploader";
import { PublicBoardView } from "@/components/moodboards/public-board";
import { RsvpForm } from "@/components/rsvp/rsvp-form";
import { SongRequestForm } from "../song-requests";
import { DressCode, MapBlock, PhotoBand, PhotoText, Playlist } from "./media";
import type { RenderContext } from "@/server/queries/site-render";

/**
 * One block, rendered (spec 23 §4).
 *
 * This is the only renderer. The shared site, a household's own page and the
 * editor's preview all call it with the same blocks and a different context —
 * which is what makes the preview honest: it is not a mock-up of the page, it
 * *is* the page, with the draft's blocks instead of the published ones.
 *
 * Personalisation happens here rather than in two copies of a layout: a block
 * marked `personal` in the catalogue asks the context whether it is rendering
 * for a household, and renders their version if so (spec 23 §6).
 */

const WIDTH_CLASS: Record<NonNullable<BlockStyle["width"]>, string> = {
  contained: "max-w-2xl",
  wide: "max-w-4xl",
  full: "max-w-none",
};

const BACKGROUND_CLASS: Record<NonNullable<BlockStyle["background"]>, string> = {
  paper: "",
  tinted: "bg-[color-mix(in_srgb,var(--site-accent)_8%,var(--site-paper))]",
  ink: "bg-ink text-paper",
};

/** A full-bleed block gets no section shell at all — that is what full means. */
function Shell({
  block,
  heading,
  intro,
  children,
}: {
  block: SiteBlock;
  heading?: string | null;
  intro?: string | null;
  children: React.ReactNode;
}) {
  const style = block.style ?? {};
  const background = BACKGROUND_CLASS[style.background ?? "paper"];
  const label = heading ?? BLOCKS[block.type].heading ?? BLOCKS[block.type].label;

  if (style.width === "full") {
    return <div className={`site-reveal ${background}`}>{children}</div>;
  }

  // An explicitly empty heading means this block has none — a prose block the
  // planner left untitled, say. Rendering `<h2></h2>` would leave the rule and
  // the vertical space of a heading with nothing in them.
  if (label === "") {
    return (
      <div className={background}>
        <section id={block.type} className="site-reveal scroll-mt-16 px-5 py-12 sm:py-16">
          <div className={`mx-auto ${WIDTH_CLASS[style.width ?? "contained"]}`}>{children}</div>
        </section>
      </div>
    );
  }

  return (
    <div className={background}>
      <SiteSection id={block.type} heading={label} intro={intro ?? undefined}>
        <div className={`mx-auto ${WIDTH_CLASS[style.width ?? "contained"]}`}>{children}</div>
      </SiteSection>
    </div>
  );
}

export function SiteBlockView({ block, ctx }: { block: SiteBlock; ctx: RenderContext }) {
  const { payload } = block;
  const personal = ctx.personal;
  const intro = text(payload, "intro");

  switch (block.type) {
    // -- essentials ---------------------------------------------------------
    case "hero": {
      const headline = text(payload, "headline") ?? ctx.wedding.name;
      const dateLabel =
        text(payload, "date_label") ??
        (ctx.wedding.wedding_date
          ? formatDate(ctx.wedding.wedding_date, ctx.wedding.timezone)
          : null);
      return (
        <>
          <SiteHero
            style={ctx.theme.heroStyle}
            headline={headline}
            dateLabel={dateLabel}
            location={text(payload, "location")}
            imagePath={ctx.imageUrls.get(text(payload, "image_id") ?? "") ?? text(payload, "image_path")}
            imageAlt={text(payload, "image_alt")}
            monogramName={ctx.theme.monogram ? ctx.wedding.name : null}
          />
          {/* Whose page this is. One line, and the only thing on the shared
              site that is missing from it. */}
          {personal ? (
            <p className="px-5 pt-10 text-center text-[0.78rem] uppercase tracking-[0.2em] text-muted">
              {personal.householdName}
            </p>
          ) : null}
        </>
      );
    }

    case "countdown": {
      if (!ctx.wedding.wedding_date) return null;
      const days = daysUntil(ctx.wedding.wedding_date);
      if (days === null) return null;
      return (
        <Countdown
          weddingDate={ctx.wedding.wedding_date}
          initialDays={days}
          label={text(payload, "label")}
        />
      );
    }

    case "story":
      return (
        <Shell block={block} intro={intro}>
          <Story payload={payload} />
        </Shell>
      );

    case "prose": {
      const body = text(payload, "body");
      if (!body) return null;
      return (
        <Shell block={block} heading={text(payload, "heading") ?? ""}>
          <Prose body={body} />
        </Shell>
      );
    }

    case "footer":
      return (
        <footer id="footer" className="px-5 pb-16 pt-6">
          <div className="mx-auto max-w-2xl text-center">
            <FloralRule className="mb-8" />
            {ctx.theme.monogram ? (
              <Monogram name={ctx.wedding.name} className="mb-4 block text-2xl text-muted" />
            ) : null}
            {text(payload, "note") ? (
              <p className="text-[1.0625rem] text-muted">{text(payload, "note")}</p>
            ) : null}
            {text(payload, "contact_email") ? (
              <p className="mt-2 text-[0.95rem]">
                <a
                  className="text-accent underline underline-offset-2"
                  href={`mailto:${text(payload, "contact_email")}`}
                >
                  {text(payload, "contact_email")}
                </a>
              </p>
            ) : null}
            {text(payload, "hashtag") ? (
              <p className="mt-2 text-[0.95rem] text-muted">{text(payload, "hashtag")}</p>
            ) : null}
            {personal ? (
              <p className="mt-6 text-[0.85rem] text-muted">
                This page is yours — there&rsquo;s no account to create. Please don&rsquo;t forward
                it; everyone else has their own.
              </p>
            ) : null}
            <p className="mt-6">
              <Link
                className="text-[0.85rem] text-muted underline underline-offset-2"
                href="/privacy"
              >
                Privacy
              </Link>
            </p>
          </div>
        </footer>
      );

    // -- the day ------------------------------------------------------------
    case "schedule":
      // Their events, with who each one is for (spec 22 §6) — or everything
      // public, for a reader we do not know.
      return personal ? (
        personal.events.length === 0 ? null : (
          <Shell block={block} heading="You're invited to" intro={intro}>
            <InvitedEvents
              events={personal.events}
              members={personal.members}
              invitedByEvent={personal.invitedByEvent}
              timeZone={ctx.wedding.timezone}
            />
          </Shell>
        )
      ) : (
        <Shell block={block} intro={intro}>
          <Schedule
            events={ctx.events}
            payload={payload}
            timeZone={ctx.wedding.timezone}
            invitedEventIds={null}
          />
        </Shell>
      );

    case "on_the_day": {
      if (!personal) return null;
      const hasNotes = personal.events.some((event) => event.guest_note?.trim());
      if (!hasNotes) return null;
      return (
        <Shell block={block} intro={intro}>
          <OnTheDay events={personal.events} timeZone={ctx.wedding.timezone} />
        </Shell>
      );
    }

    case "rsvp":
      if (!personal) {
        return (
          <Shell block={block} heading="RSVP">
            <RsvpPointer payload={payload} />
          </Shell>
        );
      }
      return (
        <Shell
          block={block}
          intro={
            personal.rsvp && !personal.rsvp.locked && personal.rsvp.wedding.rsvp_lock_at
              ? `Please reply by ${formatDate(personal.rsvp.wedding.rsvp_lock_at, ctx.wedding.timezone)}. You can change your answers until then.`
              : intro
          }
        >
          {personal.rsvp && personal.token ? (
            <RsvpForm
              token={personal.token}
              guests={personal.rsvp.guests}
              events={personal.rsvp.events}
              questions={personal.rsvp.questions}
              rsvps={personal.rsvp.rsvps}
              answers={personal.rsvp.answers}
              locked={personal.rsvp.locked}
              invites={personal.rsvp.invites}
            />
          ) : (
            <p className="text-center text-[1.0625rem] text-muted">
              We haven&rsquo;t sent your invitation yet — it&rsquo;s on its way, and this is where
              you&rsquo;ll reply when it arrives.
            </p>
          )}
        </Shell>
      );

    case "faq":
      return (
        <Shell block={block} intro={intro}>
          <Faq payload={payload} />
        </Shell>
      );

    case "dress_code": {
      const boardId = text(payload, "board_id");
      const board = boardId ? ctx.boards.find((entry) => entry.board.id === boardId) : null;
      return (
        <Shell block={block} intro={intro}>
          <DressCode payload={payload}>
            {board ? <PublicBoardView board={board} /> : null}
          </DressCode>
        </Shell>
      );
    }

    case "party":
      return (
        <Shell block={block} intro={intro}>
          <Party payload={payload} />
        </Shell>
      );

    case "things_to_do":
      return (
        <Shell block={block} intro={intro}>
          <ThingsToDo payload={payload} />
        </Shell>
      );

    // -- photos -------------------------------------------------------------
    case "gallery": {
      const images = ctx.gallery;
      if (images.length === 0 && !personal) return null;
      return (
        <Shell block={block} intro={intro}>
          <div className="space-y-10">
            <GalleryGrid images={images} />
            {/* Uploading is a thing only a household can do — the open
                internet must not be able to post into the gallery. */}
            {personal && personal.token && ctx.uploadsOpen ? (
              <GuestUploader
                token={personal.token}
                mine={personal.uploads}
                moderated={ctx.uploadsModerated}
              />
            ) : null}
          </div>
        </Shell>
      );
    }

    case "photo_band":
      return (
        <Shell block={block}>
          <PhotoBand
            url={ctx.imageUrls.get(text(payload, "image_id") ?? "") ?? null}
            alt={text(payload, "image_alt")}
            caption={text(payload, "caption")}
            shape={block.style?.shape}
          />
        </Shell>
      );

    case "photo_text":
      return (
        <Shell block={block} heading={text(payload, "heading") ?? ""}>
          <PhotoText
            url={ctx.imageUrls.get(text(payload, "image_id") ?? "") ?? null}
            alt={text(payload, "image_alt")}
            payload={payload}
            shape={block.style?.shape}
            flip={text(payload, "side") === "right"}
          />
        </Shell>
      );

    // -- travel -------------------------------------------------------------
    case "map":
      return (
        <Shell block={block} heading={text(payload, "heading") ?? "Where"} intro={intro}>
          <MapBlock
            payload={payload}
            embed={block.style?.embed === true}
            // Never on a personalised address: the referrer would hand the
            // household's private URL to a third party (spec 23 Q1).
            allowEmbed={!personal}
          />
        </Shell>
      );

    case "travel": {
      const prose = text(payload, "intro") ?? text(payload, "body");
      return (
        <Shell block={block}>
          <div className="space-y-10">
            {prose ? <Prose body={prose} /> : null}
            <CoachSection runs={ctx.travel.runs} timeZone={ctx.wedding.timezone} bookable={false} />
            <TransportList options={ctx.travel.transport} />
          </div>
        </Shell>
      );
    }

    case "stays":
      return (
        <Shell block={block} intro={intro}>
          <div className="space-y-10">
            <StaysList stays={ctx.travel.stays} />
          </div>
        </Shell>
      );

    case "coach": {
      if (ctx.travel.runs.length === 0) return null;
      return (
        <Shell block={block} intro={intro}>
          {personal && personal.token ? (
            <CoachBooking
              token={personal.token}
              runs={ctx.travel.runs}
              held={personal.seats}
              timeZone={ctx.wedding.timezone}
            />
          ) : (
            <CoachSection runs={ctx.travel.runs} timeZone={ctx.wedding.timezone} bookable={false} />
          )}
        </Shell>
      );
    }

    // -- music --------------------------------------------------------------
    case "song_requests":
      return (
        <Shell block={block} intro={null}>
          <SongRequestForm
            weddingSlug={ctx.wedding.slug}
            token={personal?.token ?? null}
            intro={intro ?? "Tell us what will get you dancing."}
          />
        </Shell>
      );

    case "playlist":
      return (
        <Shell block={block} heading={text(payload, "heading") ?? "The playlist"}>
          <Playlist
            payload={payload}
            embed={block.style?.embed === true}
            allowEmbed={!personal}
          />
        </Shell>
      );
  }
}

/** The whole page. */
export function SiteBlocks({ blocks, ctx }: { blocks: SiteBlock[]; ctx: RenderContext }) {
  return (
    <>
      {blocks.map((block) => (
        <SiteBlockView key={block.id} block={block} ctx={ctx} />
      ))}
    </>
  );
}
