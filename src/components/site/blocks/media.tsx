import { text } from "@/lib/site/sections";
import type { BlockStyle } from "@/lib/site/blocks";
import { Prose } from "../content";

/**
 * The photo blocks (spec 23 §8).
 *
 * Every image here has already been signed and sized by the caller — these
 * components take a URL and never a storage path, so a page cannot leak a
 * bucket path and a missing object costs its own block rather than the page.
 *
 * Aspect is a *style*, not something the photograph decides, because a
 * gallery of five phone photos in three orientations is the single most
 * common way a wedding site starts looking homemade.
 */

export const SHAPE_CLASS: Record<NonNullable<BlockStyle["shape"]>, string> = {
  natural: "",
  square: "aspect-square object-cover",
  portrait: "aspect-[3/4] object-cover",
  wide: "aspect-[16/9] object-cover",
};

export function PhotoBand({
  url,
  alt,
  caption,
  shape = "wide",
}: {
  url: string | null;
  alt: string | null;
  caption: string | null;
  shape?: BlockStyle["shape"];
}) {
  if (!url) return null;
  return (
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs from
          a private bucket, so next/image's optimiser has nothing to cache and
          would re-fetch an expiring URL. */}
      <img
        src={url}
        alt={alt ?? ""}
        className={`w-full ${SHAPE_CLASS[shape ?? "wide"]}`}
        loading="lazy"
      />
      {caption ? (
        <figcaption className="mt-2 px-5 text-center text-[0.9rem] text-muted">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

export function PhotoText({
  url,
  alt,
  payload,
  shape = "square",
  flip,
}: {
  url: string | null;
  alt: string | null;
  payload: unknown;
  shape?: BlockStyle["shape"];
  /** Alternate sides down the page so two of these in a row do not stack identically. */
  flip?: boolean;
}) {
  const body = text(payload, "body");
  const heading = text(payload, "heading");

  return (
    <div className={`grid items-center gap-8 sm:grid-cols-2 ${flip ? "sm:[&>figure]:order-2" : ""}`}>
      {url ? (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element -- see PhotoBand */}
          <img
            src={url}
            alt={alt ?? ""}
            className={`w-full ${SHAPE_CLASS[shape ?? "square"]}`}
            loading="lazy"
          />
        </figure>
      ) : null}
      <div>
        {heading ? <h3 className="mb-3 font-script text-3xl text-ink">{heading}</h3> : null}
        {body ? <Prose body={body} /> : null}
      </div>
    </div>
  );
}

/**
 * A map (spec 23 §8, Q1).
 *
 * The default is a static image and a button that opens the reader's own maps
 * app: faster on a phone in a field with one bar, and nothing is disclosed to
 * a third party. `embed` swaps in the real thing, per block, opt-in — and the
 * editor refuses that combination on a personalised page, because the
 * referrer there is a household's private address.
 */
export function MapBlock({
  payload,
  embed,
  allowEmbed,
}: {
  payload: unknown;
  embed: boolean;
  /** False on a personalised page: the embed would leak the household's URL. */
  allowEmbed: boolean;
}) {
  const name = text(payload, "name");
  const address = text(payload, "address");
  const note = text(payload, "note");
  const query = encodeURIComponent([name, address].filter(Boolean).join(", "));
  const directions = query ? `https://www.google.com/maps/search/?api=1&query=${query}` : null;
  const embedUrl = query ? `https://maps.google.com/maps?q=${query}&output=embed` : null;

  return (
    <div className="space-y-4">
      {name ? <p className="text-xl text-ink">{name}</p> : null}
      {address ? <p className="text-[0.95rem] text-muted">{address}</p> : null}

      {embed && allowEmbed && embedUrl ? (
        <iframe
          src={embedUrl}
          title={name ? `Map of ${name}` : "Map"}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-72 w-full border border-line"
        />
      ) : null}

      {note ? <p className="whitespace-pre-line text-[0.95rem] text-muted">{note}</p> : null}

      {directions ? (
        <p>
          <a
            href={directions}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-block border border-accent px-5 py-2 text-[0.72rem] uppercase tracking-[0.14em] text-accent hover:bg-accent hover:text-paper"
          >
            Open in Maps
          </a>
        </p>
      ) : null}
    </div>
  );
}

/** A playlist: a link card by default, the real player when opted in (Q1). */
export function Playlist({
  payload,
  embed,
  allowEmbed,
}: {
  payload: unknown;
  embed: boolean;
  allowEmbed: boolean;
}) {
  const url = text(payload, "url");
  const label = text(payload, "label") ?? "Our playlist";
  const note = text(payload, "note");
  if (!url) return null;

  const spotify = /^https:\/\/open\.spotify\.com\/(playlist|album)\/([A-Za-z0-9]+)/.exec(url);
  const embedUrl = spotify ? `https://open.spotify.com/embed/${spotify[1]}/${spotify[2]}` : null;

  return (
    <div className="space-y-4 text-center">
      {note ? <p className="text-[1.0625rem] text-muted">{note}</p> : null}

      {embed && allowEmbed && embedUrl ? (
        <iframe
          src={embedUrl}
          title={label}
          loading="lazy"
          referrerPolicy="no-referrer"
          allow="clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          className="h-40 w-full border-0"
        />
      ) : (
        <p>
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-block border border-accent px-5 py-2 text-[0.72rem] uppercase tracking-[0.14em] text-accent hover:bg-accent hover:text-paper"
          >
            {label}
          </a>
        </p>
      )}
    </div>
  );
}

/** What to wear: a sentence, and a published moodboard if there is one. */
export function DressCode({ payload, children }: { payload: unknown; children?: React.ReactNode }) {
  const body = text(payload, "body");
  return (
    <div className="space-y-8">
      {body ? <Prose body={body} /> : null}
      {children}
    </div>
  );
}
