import Image from "next/image";
import { Monogram } from "./monogram";
import { HeroCounter } from "./hero-counter";
import { splitHeadline } from "@/lib/site/names";
import type { TimeLeft } from "@/lib/format";
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
 * **Same-origin images only.** An arbitrary URL here would put a third party
 * in front of every guest (§11) and needs `remotePatterns` in next.config to
 * work at all. A path beginning with a single "/" is this app; anything else
 * is dropped and the hero falls back to `type` rather than rendering broken.
 */
function sameOriginPath(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  // "//evil.example" is protocol-relative and would leave the origin.
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed;
}

export function SiteHero({
  style,
  preset = "script",
  headline,
  dateLabel,
  location,
  imagePath,
  imageAlt,
  monogramName,
  weddingDate,
  timeLeft,
}: {
  style: HeroStyle;
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
  imagePath: string | null;
  imageAlt: string | null;
  monogramName: string | null;
  /** For the corner counter. Null when the wedding has no date yet. */
  weddingDate?: string | null;
  timeLeft?: TimeLeft | null;
}) {
  const image = sameOriginPath(imagePath);
  const effective: HeroStyle = image ? style : "type";

  if (preset === "editorial") {
    return (
      <EditorialHero
        headline={headline}
        dateLabel={dateLabel}
        location={location}
        // Editorial's hero is full-bleed whenever there is a photograph, so
        // `framed` and `full` are the same choice here. `type` is not: it is
        // somebody saying "no photo, just our names", and overriding that
        // would make the theme editor's third option do nothing.
        image={style === "type" ? null : image}
        imageAlt={imageAlt}
        weddingDate={weddingDate ?? null}
        timeLeft={timeLeft ?? null}
      />
    );
  }

  const words = (
    <div className="text-center">
      {monogramName ? (
        <Monogram name={monogramName} className="mb-5 block text-3xl text-muted" />
      ) : null}
      <h1 className="font-script text-[3.25rem] leading-[1.05] text-ink sm:text-7xl">{headline}</h1>
      {dateLabel ? (
        <p className="mt-5 text-[0.78rem] uppercase tracking-[0.2em] text-muted">{dateLabel}</p>
      ) : null}
      {location ? <p className="mt-1.5 text-[1.0625rem] text-muted">{location}</p> : null}
    </div>
  );

  if (effective === "type" || !image) {
    return (
      <header id="hero" className="scroll-mt-16 px-5 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl">{words}</div>
      </header>
    );
  }

  if (effective === "full") {
    return (
      <header id="hero" className="relative scroll-mt-16">
        <div className="relative h-[68vh] min-h-[420px] w-full">
          <Image
            src={image}
            alt={imageAlt ?? ""}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          {/* The scrim is what makes the text legible over an unknown photo.
              Without it the hero passes contrast against whatever the
              photographer happened to shoot, which is not a guarantee. */}
          <div className="absolute inset-0 bg-ink/45" />
          <div className="absolute inset-0 flex items-center justify-center px-5">
            <div className="text-paper [&_*]:text-paper">{words}</div>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header id="hero" className="scroll-mt-16 px-5 pb-14 pt-10 sm:pt-14">
      <div className="mx-auto max-w-2xl">
        <div className="border border-line p-2.5">
          <div className="relative aspect-[4/3] w-full sm:aspect-[3/2]">
            <Image
              src={image}
              alt={imageAlt ?? ""}
              fill
              priority
              sizes="(max-width: 672px) 100vw, 672px"
              className="object-cover"
            />
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
  image,
  imageAlt,
  weddingDate,
  timeLeft,
}: {
  headline: string;
  dateLabel: string | null;
  location: string | null;
  image: string | null;
  imageAlt: string | null;
  weddingDate: string | null;
  timeLeft: TimeLeft | null;
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

  const meta = (
    <div className="mt-8 flex flex-wrap items-baseline gap-x-8 gap-y-2">
      {dateLabel ? <p className="site-label site-eyebrow">{dateLabel}</p> : null}
      {location ? <p className="site-label site-eyebrow">{location}</p> : null}
    </div>
  );

  if (!image) {
    return (
      <header id="hero" className="relative scroll-mt-16 px-5 pb-16 pt-24 sm:px-10 sm:pt-32">
        {weddingDate ? (
          <HeroCounter
            startsAt={weddingDate}
            initial={timeLeft}
            className="absolute right-5 top-8 text-muted sm:right-10"
          />
        ) : null}
        <div className="mx-auto w-full max-w-5xl text-ink">
          {names}
          <div className="text-muted">{meta}</div>
        </div>
      </header>
    );
  }

  return (
    <header id="hero" className="relative scroll-mt-16">
      <div className="relative min-h-[560px] w-full sm:min-h-[88vh]">
        <Image src={image} alt={imageAlt ?? ""} fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-[rgba(18,22,19,0.62)]" />

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
          <div className="mx-auto w-full max-w-5xl text-paper [&_*]:text-paper">
            {names}
            {meta}
          </div>
        </div>
      </div>
    </header>
  );
}
