import Image from "next/image";
import { Monogram } from "./monogram";
import type { HeroStyle } from "@/lib/theme/presets";

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
  headline,
  dateLabel,
  location,
  imagePath,
  imageAlt,
  monogramName,
}: {
  style: HeroStyle;
  headline: string;
  dateLabel: string | null;
  location: string | null;
  imagePath: string | null;
  imageAlt: string | null;
  monogramName: string | null;
}) {
  const image = sameOriginPath(imagePath);
  const effective: HeroStyle = image ? style : "type";

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
