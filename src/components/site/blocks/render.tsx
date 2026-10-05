import Link from "next/link";
import { BLOCKS, sectionNumbers, type BlockStyle, type SectionMark, type SiteBlock } from "@/lib/site/blocks";
import { flag, text } from "@/lib/site/sections";
import { DEFAULT_COVER_LINE } from "@/lib/site/cover";
import { renderGreeting } from "@/lib/site/greeting";
import {
  replyBarCopy,
  replyByLabel,
  replyMembersFromContext,
  summariseReply,
} from "@/lib/site/reply-state";
import { ReplyBar } from "../reply-bar";
import { formatDate, daysUntil, timeLeft } from "@/lib/format";
import { SiteHero, type HeroCover } from "../hero";
import { ReadingLine } from "../reading-line";
import { PhotoViewer } from "../photo-viewer";
import { SiteImage } from "../site-image";
import type { SiteImageData } from "@/lib/site/site-image";
import { SiteSection } from "../section";
import { Countdown } from "../countdown";
import { Monogram } from "../monogram";
import { FloralRule } from "../rule";
import { Faq, Party, Prose, RsvpPointer, Schedule, Story, ThingsToDo } from "../content";
import { InvitedEvents } from "../invited-events";
import { WeekendCalendar } from "../weekend-calendar";
import { OnTheDay } from "../on-the-day";
import { GalleryGrid } from "../gallery";
import { CoachSection, StaysList, TransportList } from "../travel-sections";
import { CoachBooking } from "../coach-booking";
import { GuestUploader } from "../guest-uploader";
import { PublicBoardView } from "@/components/moodboards/public-board";
import { RsvpForm } from "@/components/rsvp/rsvp-form";
import { GiftFunds } from "../gift-funds";
import { SongRequestForm } from "../song-requests";
import { SongList } from "../song-list";
import { Guestbook } from "../guestbook";
import { Attire } from "../attire";
import { Arrivals } from "../arrivals";
import { runsByEvent } from "../event-inline";
import { visibleDressCodes } from "@/lib/site/dress-codes";
import {
  DressCode,
  MapBlock,
  PageBreak,
  PhotoBand,
  PhotoPlaceholder,
  PhotoText,
  Playlist,
} from "./media";
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
  // Photograph is markup rather than a class — see `Background` below.
  photograph: "",
};

/**
 * The block's ground: paper, a tint, solid ink, or a photograph.
 *
 * **The scrim over a photograph is not optional.** Same argument the hero
 * makes: without it a block passes contrast against whatever the couple
 * happened to upload, which is not a guarantee — and unlike the hero, nobody
 * is looking at this block when they choose the picture. `rgba(18,22,19,0.62)`
 * is a fixed value rather than a theme token because it has to hold over a
 * photograph, and a pale palette's `ink` would not.
 *
 * A `photograph` background whose asset has gone missing renders as plain
 * paper rather than as a dark band over nothing — one lost object costs its
 * own decoration, never the block's readability.
 */
function Background({
  style,
  image,
  children,
}: {
  style: BlockStyle;
  image: SiteImageData | null;
  children: React.ReactNode;
}) {
  const treatment = style.background ?? "paper";

  if (treatment !== "photograph" || !image) {
    return <div className={BACKGROUND_CLASS[treatment === "photograph" ? "paper" : treatment]}>{children}</div>;
  }

  return (
    <div className="relative isolate text-paper [&_*]:text-paper">
      <SiteImage
        image={image}
        alt={null}
        sizes="100vw"
        className="absolute inset-0 -z-10 h-full w-full object-cover"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[rgba(18,22,19,0.62)]" />
      {children}
    </div>
  );
}

/** A full-bleed block gets no section shell at all — that is what full means. */
function Shell({
  block,
  heading,
  intro,
  mark,
  bgImage = null,
  children,
}: {
  block: SiteBlock;
  heading?: string | null;
  intro?: string | null;
  /** `04 · ATTIRE` (spec 25 §8). Absent on a block that is not a destination. */
  mark?: SectionMark;
  /** The signed asset behind a `photograph` background, when there is one. */
  bgImage?: SiteImageData | null;
  children: React.ReactNode;
}) {
  const style = block.style ?? {};
  const label = heading ?? BLOCKS[block.type].heading ?? BLOCKS[block.type].label;

  if (style.width === "full") {
    return (
      <Background style={style} image={bgImage}>
        <div className="site-reveal">{children}</div>
      </Background>
    );
  }

  // An explicitly empty heading means this block has none — a prose block the
  // planner left untitled, say. Rendering `<h2></h2>` would leave the rule and
  // the vertical space of a heading with nothing in them.
  if (label === "") {
    return (
      <Background style={style} image={bgImage}>
        <section id={block.type} className="site-reveal scroll-mt-16 px-5 py-12 sm:py-16">
          <div className={`mx-auto ${WIDTH_CLASS[style.width ?? "contained"]}`}>{children}</div>
        </section>
      </Background>
    );
  }

  return (
    <Background style={style} image={bgImage}>
      <SiteSection
        id={block.type}
        heading={label}
        intro={intro ?? undefined}
        eyebrow={mark ? `${mark.number} · ${mark.label}` : undefined}
      >
        <div className={`mx-auto ${WIDTH_CLASS[style.width ?? "contained"]}`}>{children}</div>
      </SiteSection>
    </Background>
  );
}

export function SiteBlockView({
  block,
  ctx,
  mark,
}: {
  block: SiteBlock;
  ctx: RenderContext;
  mark?: SectionMark;
}) {
  const { payload } = block;
  const personal = ctx.personal;
  const intro = text(payload, "intro");

  // Spec 25 §6: which shuttle serves which event, and which code each event
  // wears. Computed once per block rather than per event row.
  const coachByEvent = runsByEvent(ctx.travel.runs);
  const dressCodes = ctx.extras.dressCodes;

  // The asset behind a `photograph` background, signed. Read once here rather
  // than in `Shell`, so the shell stays a layout component and never touches
  // the render context.
  const bgImage = ctx.images.get(block.style?.bgImage ?? "") ?? null;
  // Block-level switch: guests may enlarge this block's photographs unless the
  // planner turned that off (spec 27 E9).
  const zoom = block.style?.lightbox !== false;

  switch (block.type) {
    // -- essentials ---------------------------------------------------------
    case "hero": {
      // Every line of the cover is a switch, and every switch is ON when the
      // key is absent — so a hero saved before these existed renders exactly as
      // it did (spec 27 E9).
      const on = (key: string) => flag(payload, key, true);

      const headline = text(payload, "headline") ?? ctx.wedding.name;
      const dateLabel = on("show_date")
        ? (text(payload, "date_label") ??
          (ctx.wedding.wedding_date
            ? formatDate(ctx.wedding.wedding_date, ctx.wedding.timezone)
            : null))
        : null;
      const aboutWhy = on("show_intro") ? intro : null;

      // The personal cover exists only on a household's own page, and the
      // greeting only ever from `personal` — never from anything the shared
      // site, a link preview or a metadata field can see.
      const cover: HeroCover | null = personal
        ? {
            greeting: on("show_greeting")
              ? renderGreeting({
                  template: text(payload, "greeting_text"),
                  firstNames: personal.members.map((member) => member.name),
                  householdName: personal.householdName,
                })
              : null,
            coverLine: on("show_cover_line")
              ? (text(payload, "cover_line") ?? DEFAULT_COVER_LINE)
              : null,
            scrollCue: on("show_scroll_cue"),
            tall: on("tall_cover"),
          }
        : null;

      return (
        <>
          <SiteHero
            style={ctx.theme.heroStyle}
            preset={ctx.theme.preset}
            headline={headline}
            dateLabel={dateLabel}
            location={on("show_location") ? text(payload, "location") : null}
            image={ctx.images.get(text(payload, "image_id") ?? "") ?? null}
            imagePath={text(payload, "image_path")}
            imageAlt={text(payload, "image_alt")}
            monogramName={ctx.theme.monogram ? ctx.wedding.name : null}
            // The days-to-go in the corner is its own switch, apart from the
            // large countdown below: one is a detail, the other a feature.
            weddingDate={on("show_counter") ? ctx.wedding.wedding_date : null}
            // Computed on the server so the number is right in the HTML and
            // identical on both sides of hydration.
            timeLeft={timeLeft(ctx.wedding.wedding_date)}
            cover={cover}
          />
          {/* A line about why, under the date — "to celebrate those closest to
              us". Short, and the only sentence in the hero. */}
          {aboutWhy ? (
            <div className="mx-auto w-full max-w-5xl px-5 pt-6 sm:px-10">
              <p className="site-intro text-center text-[1.0625rem] italic text-muted">{aboutWhy}</p>
            </div>
          ) : null}
          {/* The countdown lives here now (spec 25 §7) rather than being a
              separate block that could end up three sections from the date it
              counts to. The standalone `countdown` block still renders for any
              page that already has one. */}
          {flag(payload, "show_countdown") &&
          ctx.wedding.wedding_date &&
          daysUntil(ctx.wedding.wedding_date) !== null ? (
            <div className="pt-8">
              <Countdown
                weddingDate={ctx.wedding.wedding_date}
                initialDays={daysUntil(ctx.wedding.wedding_date)!}
                label={text(payload, "countdown_label")}
              />
            </div>
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
        <Shell block={block} bgImage={bgImage} intro={intro} mark={mark}>
          <Story payload={payload} />
        </Shell>
      );

    case "prose": {
      const body = text(payload, "body");
      if (!body) return null;
      return (
        <Shell block={block} bgImage={bgImage} heading={text(payload, "heading") ?? ""}>
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
          <Shell block={block} bgImage={bgImage} heading="You're invited to" intro={intro} mark={mark}>
            <InvitedEvents
              events={personal.events}
              members={personal.members}
              invitedByEvent={personal.invitedByEvent}
              timeZone={ctx.wedding.timezone}
              dressCodes={dressCodes}
              coachByEvent={coachByEvent}
              preset={ctx.theme.preset}
            />
            {/* One tap to put the whole weekend in a calendar. Its own switch,
                on unless the planner turned it off (spec 27 E9). */}
            {flag(payload, "show_calendar", true) ? (
              <WeekendCalendar
                events={personal.events}
                timeZone={ctx.wedding.timezone}
                weddingName={ctx.wedding.name}
                weddingSlug={ctx.wedding.slug}
                addressSegment={personal.addressSegment}
              />
            ) : null}
          </Shell>
        )
      ) : (
        <Shell block={block} bgImage={bgImage} intro={intro} mark={mark}>
          <Schedule
            events={ctx.events}
            payload={payload}
            timeZone={ctx.wedding.timezone}
            invitedEventIds={null}
            dressCodes={dressCodes}
            coachByEvent={coachByEvent}
            preset={ctx.theme.preset}
          />
        </Shell>
      );

    case "on_the_day": {
      if (!personal) return null;
      const hasNotes = personal.events.some((event) => event.guest_note?.trim());
      if (!hasNotes) return null;
      return (
        <Shell block={block} bgImage={bgImage} intro={intro} mark={mark}>
          <OnTheDay events={personal.events} timeZone={ctx.wedding.timezone} />
        </Shell>
      );
    }

    case "rsvp":
      if (!personal) {
        return (
          <Shell block={block} bgImage={bgImage} heading="RSVP" mark={mark}>
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
              weekend={{
                timeZone: ctx.wedding.timezone,
                weddingName: ctx.wedding.name,
                weddingSlug: ctx.wedding.slug,
                addressSegment: personal.addressSegment,
              }}
              replyBy={
                ctx.theme.layout.replyByDate
                  ? replyByLabel(personal.rsvp.wedding.rsvp_lock_at, ctx.wedding.timezone)
                  : null
              }
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
        <Shell block={block} bgImage={bgImage} intro={intro} mark={mark}>
          <Faq payload={payload} />
        </Shell>
      );

    case "dress_code": {
      const boardId = text(payload, "board_id");
      const board = boardId ? ctx.boards.find((entry) => entry.board.id === boardId) : null;

      // Narrowed to the codes covering events this reader can see: on a
      // household's page, a code whose only event is the brunch they were not
      // invited to would name a party nobody told them about (spec 25 §4).
      const codes = visibleDressCodes(
        dressCodes,
        personal ? new Set(personal.events.map((event) => event.id)) : null,
      );

      return (
        <Shell block={block} bgImage={bgImage} intro={intro} mark={mark}>
          <DressCode payload={payload}>
            {codes.length > 0 ? <Attire codes={codes} boards={ctx.boards} /> : null}
            {board ? <PublicBoardView board={board} /> : null}
          </DressCode>
        </Shell>
      );
    }

    case "party":
      return (
        <Shell block={block} bgImage={bgImage} intro={intro} mark={mark}>
          <Party payload={payload} />
        </Shell>
      );

    case "things_to_do":
      return (
        <Shell block={block} bgImage={bgImage} intro={intro} mark={mark}>
          <ThingsToDo payload={payload} />
        </Shell>
      );

    // -- photos -------------------------------------------------------------
    case "gallery": {
      const images = ctx.gallery;
      if (images.length === 0 && !personal) return null;
      return (
        <Shell block={block} bgImage={bgImage} intro={intro} mark={mark}>
          <div className="space-y-10">
            <GalleryGrid images={images} zoom={zoom} />
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

    case "page_break": {
      const image = ctx.images.get(text(payload, "image_id") ?? "") ?? null;
      // Nothing to punctuate with. On a live page an empty band is a dark gap
      // nobody can see the cause of, so it renders as nothing at all; the
      // planner's preview says what is missing instead.
      if (!image) return ctx.preview ? <PhotoPlaceholder fullBleed /> : null;
      return (
        <PageBreak image={image} alt={text(payload, "image_alt")} shape={block.style?.shape} zoom={zoom} />
      );
    }

    case "photo_band": {
      const image = ctx.images.get(text(payload, "image_id") ?? "") ?? null;
      return (
        <Shell block={block} bgImage={bgImage}>
          {image || !ctx.preview ? (
            <PhotoBand
              image={image}
              alt={text(payload, "image_alt")}
              caption={text(payload, "caption")}
              shape={block.style?.shape}
              zoom={zoom}
              sizes={
                block.style?.width === "full"
                  ? "100vw"
                  : block.style?.width === "wide"
                    ? "(min-width: 896px) 896px, 100vw"
                    : "(min-width: 672px) 672px, 100vw"
              }
            />
          ) : (
            <PhotoPlaceholder shape={block.style?.shape} />
          )}
        </Shell>
      );
    }

    case "photo_text":
      return (
        <Shell block={block} bgImage={bgImage} heading={text(payload, "heading") ?? ""}>
          <PhotoText
            image={ctx.images.get(text(payload, "image_id") ?? "") ?? null}
            showPlaceholder={ctx.preview}
            zoom={zoom}
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
        <Shell block={block} bgImage={bgImage} heading={text(payload, "heading") ?? "Where"} intro={intro}>
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
      // A wedding that has set up arrival points gets the grouped rendering;
      // one that has not gets exactly the list it had before (spec 25 §5).
      const hasArrivals = ctx.extras.arrivals.length > 0;
      return (
        <Shell block={block} bgImage={bgImage} mark={mark}>
          <div className="space-y-10">
            {prose ? <Prose body={prose} /> : null}
            <CoachSection runs={ctx.travel.runs} timeZone={ctx.wedding.timezone} bookable={false} />
            {hasArrivals ? (
              <Arrivals points={ctx.extras.arrivals} legs={ctx.travel.transport} />
            ) : (
              <TransportList options={ctx.travel.transport} />
            )}
          </div>
        </Shell>
      );
    }

    case "stays":
      return (
        <Shell block={block} bgImage={bgImage} intro={intro} mark={mark}>
          <div className="space-y-10">
            <StaysList stays={ctx.travel.stays} />
          </div>
        </Shell>
      );

    case "coach": {
      if (ctx.travel.runs.length === 0) return null;
      return (
        <Shell block={block} bgImage={bgImage} intro={intro} mark={mark}>
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

    case "gift_funds": {
      // No funds means nothing to say. The heading over an empty list reads
      // as "we wanted presents and could not think of any".
      if (ctx.extras.giftFunds.length === 0) return null;
      const background = block.style?.background;
      return (
        <Shell block={block} bgImage={bgImage} intro={intro} mark={mark}>
          <GiftFunds
            funds={ctx.extras.giftFunds}
            dark={background === "ink" || (background === "photograph" && bgImage !== null)}
          />
        </Shell>
      );
    }

    // -- music --------------------------------------------------------------
    case "song_requests":
      return (
        <Shell block={block} bgImage={bgImage} intro={null} mark={mark}>
          <SongRequestForm
            weddingSlug={ctx.wedding.slug}
            token={personal?.token ?? null}
            intro={intro ?? "Tell us what will get you dancing."}
          />
          {/* Spec 25 §11 — approved requests, rendered back, because a form
              nobody sees the result of is a suggestion box. */}
          <SongList
            weddingSlug={ctx.wedding.slug}
            token={personal?.token ?? null}
            songs={ctx.extras.songs}
          />
        </Shell>
      );

    case "guestbook":
      return (
        <Shell block={block} bgImage={bgImage} intro={intro} mark={mark}>
          <Guestbook
            weddingSlug={ctx.wedding.slug}
            token={personal?.token ?? null}
            prompt={text(payload, "prompt")}
            notes={ctx.extras.notes}
          />
        </Shell>
      );

    case "playlist":
      return (
        <Shell block={block} bgImage={bgImage} heading={text(payload, "heading") ?? "The playlist"} mark={mark}>
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
  // Numbered here, over the blocks this reader actually gets: the caller has
  // already dropped hidden blocks and ones for another audience, so a guest
  // never sees 01, 02, 04 and wonders what they missed (spec 25 §8).
  const marks = sectionNumbers(blocks);
  // A switch, not a theme: the planner can have headings without the numbers
  // above them (spec 27 E9). The chapter rail reads `sectionNumbers` itself.
  const numbered = ctx.theme.layout.sectionNumbers;

  // The reply bar (spec 27 §7): only on a household's own page, only when the
  // page has somewhere to send them, and only while replying is still open.
  // In the builder's preview, where there is no real reply, it shows what a
  // household that has not answered would see — otherwise the planner could
  // never see the thing the switch controls.
  const personal = ctx.personal;
  const hasReplySection = blocks.some((block) => block.type === "rsvp");
  let bar: { text: string; action: string } | null = null;
  if (personal && ctx.theme.layout.replyBar && hasReplySection) {
    if (personal.rsvp && personal.token) {
      if (!personal.rsvp.locked) {
        bar = replyBarCopy(
          summariseReply(replyMembersFromContext(personal.rsvp)),
          ctx.theme.layout.replyByDate
            ? replyByLabel(personal.rsvp.wedding.rsvp_lock_at, ctx.wedding.timezone)
            : null,
        );
      }
    } else if (ctx.preview) {
      bar = { text: "Your reply", action: "Reply" };
    }
  }

  return (
    <>
      <ReadingLine />
      {blocks.map((block) => (
        // The id is what the builder's preview uses to scroll to a block and to
        // tell the builder which one was clicked. It carries no content, and a
        // wrapper with no styling changes nothing about the layout.
        <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
          <SiteBlockView block={block} ctx={ctx} mark={numbered ? marks.get(block.id) : undefined} />
        </div>
      ))}
      <PhotoViewer enabled={!ctx.preview} />
      {bar ? (
        <>
          {/* Room beneath the last block for the bar to sit in, on phones, so
              it never covers the end of the page (`globals.css`). */}
          <div aria-hidden="true" className="site-replybar-spacer" />
          <ReplyBar text={bar.text} action={bar.action} />
        </>
      ) : null}
    </>
  );
}
