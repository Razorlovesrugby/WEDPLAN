import type { CSSProperties, ReactNode } from "react";
import { siteFontClasses, typographyCssVars } from "@/lib/fonts";
import { splitHeadline } from "@/lib/site/names";
import { timeLeft } from "@/lib/format";
import type { SaveTheDateDisplay, SaveTheDateLayout } from "@/lib/site/save-the-date";
import type { TypographyId } from "@/lib/theme/presets";
import { HeroCounter } from "@/components/site/hero-counter";

/**
 * The save-the-date itself.
 *
 * One component for the guest's page and the planner's live preview, because
 * a preview with its own renderer starts lying the moment anybody changes the
 * real one (the same rule `/site/preview` follows). It takes everything
 * already resolved — words, signed photo URLs, colours — and fetches nothing,
 * which is what lets the editor re-render it on every keystroke.
 *
 * Always set in the Editorial type, whatever theme the site uses: large
 * display serif, letterspaced labels. The layout decides the composition.
 */

export type SaveTheDateCardPhoto = {
  id: string;
  url: string;
  alt: string | null;
};

export type SaveTheDateCardProps = {
  display: SaveTheDateDisplay;
  /** "For the Okonkwos", or null to leave it off. */
  greeting: string | null;
  photos: SaveTheDateCardPhoto[];
  layout: SaveTheDateLayout;
  /** `--site-*` channels for the chosen palette. */
  colourVars: Record<string, string>;
  typography: TypographyId;
  /** The wedding date, when the countdown is on and there is one. */
  countdownDate: string | null;
  calendar: { icsHref: string; googleHref: string } | null;
  /** The arrival animation. Off in the editor, where it would replay nothing useful. */
  animate?: boolean;
};

function rise(delay: number): CSSProperties {
  return { ["--std-delay" as string]: `${delay}ms` };
}

function Names({ headline, className = "" }: { headline: string; className?: string }) {
  const split = splitHeadline(headline);
  return (
    <h1 className={`std-names site-heading ${className}`}>
      {split ? (
        <>
          {split.left}
          {/* Hidden from screen readers with the joiner restored beside it,
              so it is heard as "Ray and Olivia" in one breath. */}
          <span aria-hidden="true" className="std-amp">
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
}

function Photo({
  photo,
  className,
  eager = false,
}: {
  photo: SaveTheDateCardPhoto;
  className: string;
  eager?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed URLs from a
    // private bucket; next/image would cache a URL that expires.
    <img
      src={photo.url}
      alt={photo.alt ?? ""}
      loading={eager ? "eager" : "lazy"}
      className={`block w-full object-cover ${className}`}
    />
  );
}

function Grid({ photos, className = "" }: { photos: SaveTheDateCardPhoto[]; className?: string }) {
  if (photos.length === 0) return null;
  // Two or three photos fill the row rather than leaving a gap in a four-up
  // grid; four and five fall back to four across and wrap.
  const cols = photos.length <= 3 ? photos.length : 4;
  return (
    <div
      className={`std-grid ${className}`}
      style={{ ["--std-cols" as string]: String(Math.max(cols, 2)) }}
    >
      {photos.map((photo, index) => (
        <Photo
          key={photo.id}
          photo={photo}
          // An odd count in two columns would leave the last photo alone on
          // its row; the first goes full width instead (phones only — the
          // wider grid already fits them in one row).
          className={index === 0 && photos.length % 2 === 1 ? "std-grid-lead" : "aspect-[3/4]"}
        />
      ))}
    </div>
  );
}

function Calendar({
  calendar,
  className = "",
}: {
  calendar: SaveTheDateCardProps["calendar"];
  className?: string;
}) {
  if (!calendar) return null;
  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      <a href={calendar.icsHref} className="std-button" download>
        Add to Apple / Outlook
      </a>
      <a href={calendar.googleHref} className="std-button" target="_blank" rel="noreferrer">
        Add to Google
      </a>
    </div>
  );
}

function Countdown({ date, className }: { date: string | null; className: string }) {
  if (!date) return null;
  return <HeroCounter startsAt={date} initial={timeLeft(date)} className={className} />;
}

function Message({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`std-message font-body ${className}`}>{children}</p>;
}

export function SaveTheDateCard(props: SaveTheDateCardProps) {
  const { layout, colourVars, typography, animate = false } = props;
  return (
    <div
      data-site-theme="editorial"
      data-std-layout={layout}
      data-animate={animate ? "true" : "false"}
      style={{ ...colourVars, ...typographyCssVars("editorial", typography) }}
      className={`std ${siteFontClasses("editorial")} bg-paper font-body text-ink antialiased`}
    >
      {layout === "cover" ? <Cover {...props} /> : null}
      {layout === "editorial" ? <Editorial {...props} /> : null}
      {layout === "postcard" ? <Postcard {...props} /> : null}
    </div>
  );
}

function Cover({ display, greeting, photos, countdownDate, calendar }: SaveTheDateCardProps) {
  const [lead, ...rest] = photos;
  const onPhoto = Boolean(lead);
  const tone = onPhoto ? "text-paper" : "text-ink";
  const soft = onPhoto ? "text-paper/80" : "text-muted";

  return (
    <>
      <header className="std-cover" data-has-photo={onPhoto ? "true" : "false"}>
        {lead ? (
          <>
            <Photo photo={lead} className="absolute inset-0 h-full" eager />
            <div className="std-scrim absolute inset-0" />
          </>
        ) : null}

        <div
          className={`std-pad relative flex w-full flex-col justify-between gap-16 pb-10 ${
            onPhoto ? "pt-8" : "pt-14"
          } ${tone}`}
        >
          <div
            className={`std-measure flex flex-wrap items-baseline justify-between gap-3 ${soft}`}
          >
            <p className="std-eyebrow std-rise">{display.eyebrow}</p>
            <Countdown date={countdownDate} className={`std-eyebrow ${soft}`} />
          </div>

          <div className="std-measure">
            {greeting ? (
              <p className={`std-eyebrow std-rise mb-6 ${soft}`} style={rise(120)}>
                For {greeting}
              </p>
            ) : null}
            <div className="std-rise" style={rise(200)}>
              <Names headline={display.headline} />
            </div>
            <div
              className={`std-rise mt-8 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-t pt-5 ${
                onPhoto ? "border-paper/40" : "border-line"
              }`}
              style={rise(360)}
            >
              {display.dateLabel ? (
                <p className="std-date site-heading">{display.dateLabel}</p>
              ) : null}
              {display.location ? (
                <p className={`std-eyebrow ${soft}`}>{display.location}</p>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <section className={`std-pad pb-14 ${onPhoto ? "pt-14" : "pt-2"}`}>
        <div className="std-measure">
          <Message className="max-w-2xl text-muted">{display.message}</Message>
          <Calendar calendar={calendar} className="mt-8" />
          <Grid photos={rest} className="mt-12" />
        </div>
      </section>
    </>
  );
}

function Editorial({ display, greeting, photos, countdownDate, calendar }: SaveTheDateCardProps) {
  const [lead, ...rest] = photos;
  return (
    <main className="std-pad pb-16 pt-12">
      <div className="std-measure">
        <div className="flex flex-wrap items-baseline justify-between gap-3 text-muted">
          <p className="std-eyebrow std-rise">{display.eyebrow}</p>
          {greeting ? (
            <p className="std-eyebrow std-rise" style={rise(80)}>
              For {greeting}
            </p>
          ) : null}
        </div>

        <div className="std-rise mt-12" style={rise(160)}>
          <Names headline={display.headline} />
        </div>

        <div
          className="std-rise mt-10 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-t border-line pt-5"
          style={rise(300)}
        >
          {display.dateLabel ? <p className="std-date site-heading">{display.dateLabel}</p> : null}
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-muted">
            {display.location ? <p className="std-eyebrow">{display.location}</p> : null}
            <Countdown date={countdownDate} className="std-eyebrow text-muted" />
          </div>
        </div>

        {lead ? (
          <div className="std-rise mt-12" style={rise(420)}>
            <Photo photo={lead} className="std-lead-wide" eager />
          </div>
        ) : null}
        <Grid photos={rest} className="mt-3" />

        <Message className="mt-12 max-w-2xl text-muted">{display.message}</Message>
        <Calendar calendar={calendar} className="mt-8" />
      </div>
    </main>
  );
}

function Postcard({ display, greeting, photos, countdownDate, calendar }: SaveTheDateCardProps) {
  const [lead, ...rest] = photos;
  return (
    <main className="std-pad py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="std-frame std-rise">
          <div className="flex flex-col items-center px-2 pb-10 pt-6 text-center">
            <p className="std-eyebrow text-muted">{display.eyebrow}</p>

            {lead ? (
              <div className="mt-6 w-full">
                <Photo photo={lead} className="std-lead-card" eager />
              </div>
            ) : null}

            {greeting ? <p className="std-eyebrow mt-10 text-muted">For {greeting}</p> : null}
            <div className={greeting ? "mt-5" : "mt-10"}>
              <Names headline={display.headline} />
            </div>

            <div className="std-rule mt-8" />
            {display.dateLabel ? (
              <p className="std-date site-heading mt-6">{display.dateLabel}</p>
            ) : null}
            {display.location ? (
              <p className="std-eyebrow mt-3 text-muted">{display.location}</p>
            ) : null}
            <Countdown date={countdownDate} className="std-eyebrow mt-3 text-muted" />

            <Message className="mt-8 max-w-md text-muted">{display.message}</Message>
            <Calendar calendar={calendar} className="mt-8 justify-center" />
          </div>
        </div>

        <Grid photos={rest} className="mt-3" />
      </div>
    </main>
  );
}
