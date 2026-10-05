import { Monogram } from "./monogram";
import { HeroCounter } from "./hero-counter";
import { splitHeadline } from "@/lib/site/names";
import type { TimeLeft } from "@/lib/format";
import { objectPosition, type SiteImageData } from "@/lib/site/site-image";
import type { HeroStyle, ThemePresetId } from "@/lib/theme/presets";

/**
 * The hero (spec 14 §5).
 *
 * `framed` is what the planner chose (Q3b): a bordered, inset image with the
 * names beneath it — the composition of an invitation, where text over a
 * full-bleed scrim is the composition of a landing page.
 *
 * `type` is the fallback whenever there is no image, which is also what a
 * half-configured site should render rather than an empty frame. With this
 * theme that is not a downgrade: a monogram and two names set in the script
 * face is what the front of an invitation looks like.
 *
 * **Two sources, only one of them typed by a person.** `image` is a photograph
 * the planner uploaded, resolved by the server to the app's own stable
 * `/api/photo/<id>` address (spec 27) — never a field somebody typed, so it
 * needs no check. `imagePath` is the legacy typed path, and an arbitrary one
 * would put a third party in front of every guest (§11): a path beginning with
 * a single "/" is this app, anything else is dropped and the hero falls back
 * to `type` rather than rendering broken. Do not run `image` through
 * `sameOriginPath` — that is what made an uploaded hero photo vanish from the
 * preview.
 */
function sameOriginPath(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  // "//evil.example" is protocol-relative and would leave the origin.
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed;
}

/**
 * The parts of the cover that exist only on a household's own page (spec 27 §5).
 *
 * `null` on the shared site, which gets the hero exactly as it always did — the
 * personal cover is a branch inside the hero, not a second layout, which is
 * what keeps "the site and the invitation are the same thing" true in the code.
 * Every line is already decided by the caller (switched off, empty, or filled):
 * nothing here knows what a household is.
 */
/** How the hero is composed: the theme's own (`full`, `framed`, `type`) or the block's `split`. */
export type HeroLook = "full" | "framed" | "split" | "type";

export type HeroCover = {
  /** "For Chidi, Ada and Zara". Null when the planner switched it off. */
  greeting: string | null;
  /** "invite you to their wedding". Null when switched off. */
  coverLine: string | null;
  /** The small arrow that says there is more below. */
  scrollCue: boolean;
  /** First screen full height, on a phone. Off keeps the hero at the site's own height. */
  tall: boolean;
};

/** What the hero draws: either an uploaded photograph or the legacy path. */
type HeroPicture = Pick<SiteImageData, "src" | "srcSet" | "colour" | "focal" | "width" | "height">;

/**
 * A plain `<img>`, as in `PhotoBand`: the address redirects to a signed URL
 * from a private bucket, so next/image's optimiser has nothing stable to cache.
 * Eager and high priority — it is the first thing the guest is waiting for —
 * with the photograph's own average colour behind it until it decodes, and its
 * focal point as the crop.
 */
function HeroImage({ picture, alt }: { picture: HeroPicture; alt: string | null }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see above
    <img
      src={picture.src}
      srcSet={picture.srcSet ?? undefined}
      sizes={picture.srcSet ? "100vw" : undefined}
      alt={alt ?? ""}
      fetchPriority="high"
      decoding="async"
      className="absolute inset-0 h-full w-full object-cover"
      style={{
        backgroundColor: picture.colour ?? undefined,
        objectPosition: objectPosition(picture.focal),
      }}
    />
  );
}

/** The small arrow under the cover. Decorative, so hidden from assistive tech. */
function ScrollCue({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`site-cue ${className}`}>
      <span className="site-cue-arrow">↓</span>
    </span>
  );
}

/** Greeting, in the theme's own voice. One element so a theme can restyle it. */
function Greeting({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`site-greeting ${className}`}>{children}</p>;
}

export function SiteHero({
  style,
  preset = "script",
  headline,
  dateLabel,
  location,
  image = null,
  imagePath,
  imageAlt,
  monogramName,
  weddingDate,
  timeLeft,
  cover = null,
}: {
  style: HeroLook;
  /**
   * Editorial's hero is a different composition, not a restyled one — the
   * names are left-aligned at up to 150px with the ampersand on its own line,
   * and there is a counter in the corner. That is more than a stylesheet can
   * do to this markup, which is why this is the one place in the renderer
   * that branches on the preset.
   */
  preset?: ThemePresetId;
  headline: string;
  dateLabel: string | null;
  location: string | null;
  /** An uploaded photograph, resolved by the server. Trusted. */
  image?: SiteImageData | null;
  imagePath: string | null;
  imageAlt: string | null;
  monogramName: string | null;
  /** For the corner counter. Null when the wedding has no date yet. */
  weddingDate?: string | null;
  timeLeft?: TimeLeft | null;
  /** Null on the shared site. See `HeroCover`. */
  cover?: HeroCover | null;
}) {
  const legacy = sameOriginPath(imagePath);
  const picture: HeroPicture | null =
    image ?? (legacy ? { src: legacy, srcSet: null, colour: null, focal: null, width: null, height: null } : null);
  const effective: HeroLook = picture ? style : "type";

  if (preset === "editorial") {
    return (
      <EditorialHero
        headline={headline}
        dateLabel={dateLabel}
        location={location}
        // `type` is somebody saying "no photo, just our names", and overriding
        // that would make the third Look do nothing — so it is honoured even
        // when there is a photograph, exactly as before.
        look={style}
        picture={style === "type" ? null : picture}
        imageAlt={imageAlt}
        weddingDate={weddingDate ?? null}
        timeLeft={timeLeft ?? null}
        cover={cover}
      />
    );
  }

  const words = (
    <div className="site-cover-words text-center">
      {cover?.greeting ? (
        <Greeting className="mb-6 text-[1.25rem] italic text-muted">{cover.greeting}</Greeting>
      ) : null}
      {monogramName ? (
        <Monogram name={monogramName} className="mb-5 block text-3xl text-muted" />
      ) : null}
      <h1 className="font-script text-[3.25rem] leading-[1.05] text-ink sm:text-7xl">{headline}</h1>
      {cover?.coverLine ? (
        <p className="site-cover-line mt-4 text-[0.78rem] uppercase tracking-[0.2em] text-muted">
          {cover.coverLine}
        </p>
      ) : null}
      {dateLabel ? (
        <p className="mt-5 text-[0.78rem] uppercase tracking-[0.2em] text-muted">{dateLabel}</p>
      ) : null}
      {location ? <p className="mt-1.5 text-[1.0625rem] text-muted">{location}</p> : null}
    </div>
  );

  if (effective === "type" || !picture) {
    return (
      <header id="hero" className="scroll-mt-16 px-5 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl">{words}</div>
      </header>
    );
  }

  if (effective === "full") {
    return (
      <header id="hero" className="relative scroll-mt-16">
        <div
          className={`relative w-full ${
            cover?.tall ? "h-[calc(100dvh-52px)] min-h-[520px]" : "h-[68vh] min-h-[420px]"
          }`}
        >
          <div className="site-cover-photo absolute inset-0 overflow-hidden">
            <HeroImage picture={picture} alt={imageAlt} />
          </div>
          {/* The scrim is what makes the text legible over an unknown photo.
              Without it the hero passes contrast against whatever the
              photographer happened to shoot, which is not a guarantee. */}
          <div className="absolute inset-0 bg-ink/45" />
          <div className="site-cover-dim absolute inset-0 bg-ink/30" />
          <div className="absolute inset-0 flex items-center justify-center px-5">
            <div className="text-paper [&_*]:text-paper">{words}</div>
          </div>
          {cover?.scrollCue ? <ScrollCue className="text-paper" /> : null}
        </div>
      </header>
    );
  }

  if (effective === "split") {
    return (
      <header id="hero" className="scroll-mt-16 px-5 py-10 sm:py-14">
        <div className="mx-auto grid max-w-5xl items-center gap-8 md:grid-cols-2 md:gap-12">
          <div className="relative aspect-[4/5] w-full overflow-hidden">
            <HeroImage picture={picture} alt={imageAlt} />
          </div>
          {words}
        </div>
      </header>
    );
  }

  return (
    <header id="hero" className="scroll-mt-16 px-5 pb-14 pt-10 sm:pt-14">
      <div className="mx-auto max-w-2xl">
        <div className="border border-line p-2.5">
          <div className="relative aspect-[4/3] w-full overflow-hidden sm:aspect-[3/2]">
            <HeroImage picture={picture} alt={imageAlt} />
          </div>
        </div>
        <div className="mt-9">{words}</div>
      </div>
    </header>
  );
}

/**
 * Editorial's hero.
 *
 * A full-bleed photograph, a scrim, and the names set left at up to 150px
 * with the ampersand dropped to its own line. The counter sits in the top
 * corner rather than under the date, where at this type size it would read as
 * part of the location.
 *
 * **The scrim is not optional.** It is the same argument the `full` hero above
 * makes: without it the names pass contrast against whatever the photographer
 * happened to shoot, which is not a guarantee. `rgba(18,22,19,0.62)` is a
 * fixed value rather than a theme token on purpose — it has to hold over a
 * photograph, and a pale palette's `ink` would not.
 *
 * With no photograph it sets the same type on `paper`. That is not a
 * downgrade: names this size on an empty page is a composition in its own
 * right, and it is what a half-configured site should render rather than an
 * empty frame.
 */
function EditorialHero({
  headline,
  dateLabel,
  location,
  picture,
  imageAlt,
  weddingDate,
  timeLeft,
  cover,
  look,
}: {
  headline: string;
  dateLabel: string | null;
  location: string | null;
  picture: HeroPicture | null;
  imageAlt: string | null;
  weddingDate: string | null;
  timeLeft: TimeLeft | null;
  cover: HeroCover | null;
  look: HeroLook;
}) {
  const split = splitHeadline(headline);

  const names = (
    <h1 className="site-h1 site-heading">
      {split ? (
        <>
          {split.left}
          {/* Marked aria-hidden with the joiner restored to the accessible
              name, so a screen reader hears "Ray and Olivia" in one breath
              rather than three fragments. */}
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
  );

  const greeting = cover?.greeting ? (
    <Greeting className="site-heading mb-5 text-[clamp(1.25rem,3.4vw,1.9rem)] italic">
      {cover.greeting}
    </Greeting>
  ) : null;

  const coverLine = cover?.coverLine ? (
    <p className="site-cover-line site-label site-eyebrow mt-6">{cover.coverLine}</p>
  ) : null;

  const meta = (
    <div className={`${cover?.coverLine ? "mt-3" : "mt-8"} flex flex-wrap items-baseline gap-x-8 gap-y-2`}>
      {dateLabel ? <p className="site-label site-eyebrow">{dateLabel}</p> : null}
      {location ? <p className="site-label site-eyebrow">{location}</p> : null}
    </div>
  );

  if (!picture || look === "type") {
    return (
      <header id="hero" className="relative scroll-mt-16 px-5 pb-16 pt-24 sm:px-10 sm:pt-32">
        {weddingDate ? (
          <HeroCounter
            startsAt={weddingDate}
            initial={timeLeft}
            className="absolute right-5 top-8 text-muted sm:right-10"
          />
        ) : null}
        <div className="site-cover-words mx-auto w-full max-w-5xl text-ink">
          {greeting}
          {names}
          <div className="text-muted">
            {coverLine}
            {meta}
          </div>
        </div>
      </header>
    );
  }

  const counter = weddingDate ? (
    <HeroCounter
      startsAt={weddingDate}
      initial={timeLeft}
      className="absolute right-5 top-8 text-muted sm:right-10"
    />
  ) : null;

  // The photograph in a bordered frame, the names beneath, left-aligned.
  if (look === "framed") {
    return (
      <header id="hero" className="relative scroll-mt-16 px-5 pb-14 pt-16 sm:px-10 sm:pt-20">
        {counter}
        <div className="mx-auto w-full max-w-5xl">
          <div className="border border-line p-2.5 sm:p-3">
            <div className="relative aspect-[4/3] w-full overflow-hidden sm:aspect-[16/9]">
              <HeroImage picture={picture} alt={imageAlt} />
            </div>
          </div>
          <div className="site-cover-words mt-10 text-ink">
            {greeting}
            {names}
            <div className="text-muted">
              {coverLine}
              {meta}
            </div>
          </div>
        </div>
      </header>
    );
  }

  // The photograph beside the names. Stacks, photograph first, on a phone.
  if (look === "split") {
    return (
      <header id="hero" className="relative scroll-mt-16 px-5 pb-14 pt-16 sm:px-10 sm:pt-20">
        {counter}
        <div className="mx-auto grid w-full max-w-6xl items-center gap-8 md:grid-cols-2 md:gap-14">
          <div className="relative aspect-[4/5] w-full overflow-hidden">
            <HeroImage picture={picture} alt={imageAlt} />
          </div>
          {/* Half the width, so the names are set smaller than on the full-bleed
              cover: "Olivia" at 150px would not fit the column. */}
          <div className="site-cover-words text-ink md:[&_.site-h1]:text-[clamp(48px,6.4vw,100px)]">
            {greeting}
            {names}
            <div className="text-muted">
              {coverLine}
              {meta}
            </div>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header id="hero" className="relative scroll-mt-16">
      <div
        className={`relative w-full ${
          cover?.tall ? "min-h-[max(560px,calc(100dvh-52px))]" : "min-h-[560px] sm:min-h-[88vh]"
        }`}
      >
        <div className="site-cover-photo absolute inset-0 overflow-hidden">
          <HeroImage picture={picture} alt={imageAlt} />
        </div>
        <div className="absolute inset-0 bg-[rgba(18,22,19,0.62)]" />
        <div className="site-cover-dim absolute inset-0 bg-[rgba(18,22,19,0.4)]" />

        {weddingDate ? (
          <HeroCounter
            startsAt={weddingDate}
            initial={timeLeft}
            className="absolute right-5 top-8 text-paper/80 sm:right-10"
          />
        ) : null}

        {/* Bottom-aligned. Names this size centred in the frame leave the
            photograph with no room to be a photograph. */}
        <div className="absolute inset-x-0 bottom-0 px-5 pb-14 sm:px-10 sm:pb-20">
          <div className="site-cover-words mx-auto w-full max-w-5xl text-paper [&_*]:text-paper">
            {greeting}
            {names}
            {coverLine}
            {meta}
          </div>
        </div>
        {cover?.scrollCue ? <ScrollCue className="text-paper" /> : null}
      </div>
    </header>
  );
}
