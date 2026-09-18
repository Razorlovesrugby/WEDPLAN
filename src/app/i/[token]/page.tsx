import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { body, script } from "@/lib/fonts";
import { resolveCard } from "@/server/rsvp/card";
import { themeCssVars } from "@/lib/theme/presets";
import { Monogram } from "@/components/site/monogram";
import { FloralRule } from "@/components/site/rule";
import { formatDate } from "@/lib/format";

/**
 * The stationery card (spec 14 §12.2).
 *
 * This is the thing you send over WhatsApp. A real proportion of any guest
 * list receives their invitation that way rather than by email, and a naked
 * URL in a chat looks like spam — so this page exists to be a *card*, with an
 * Open Graph image behind it so the preview is the invitation rather than a
 * link.
 *
 * It carries the same household token as everything else (§12.1), so the
 * "See the details" button lands on that household's own RSVP page with no
 * second link to lose.
 *
 * Voice: the face of the card keeps formal third person — "request the
 * pleasure of your company" — because that is a typographic tradition rather
 * than a voice (Q11). Everything around it, and the whole site it links to,
 * is "we".
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const card = await resolveCard(token);
  if (!card) return { title: "Invitation", robots: { index: false, follow: false } };

  const dateLabel =
    card.hero.dateLabel ??
    (card.wedding.wedding_date ? formatDate(card.wedding.wedding_date, card.wedding.timezone) : null);

  const title = card.hero.headline ?? card.wedding.name;
  const description = [dateLabel, card.hero.location].filter(Boolean).join(" · ") || "You're invited";

  return {
    title,
    description,
    // noindex, like everything else with a token in the URL. The card is
    // shareable, not public: a search engine that indexed one would be
    // publishing a working invitation link.
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: `/i/${token}/opengraph-image`, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function InvitationCardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const card = await resolveCard(token);
  if (!card) notFound();

  const dateLabel =
    card.hero.dateLabel ??
    (card.wedding.wedding_date ? formatDate(card.wedding.wedding_date, card.wedding.timezone) : null);
  const names = card.hero.headline ?? card.wedding.name;

  return (
    <div
      style={themeCssVars(card.theme)}
      className={`${script.variable} ${body.variable} flex min-h-screen items-center justify-center bg-paper px-5 py-12 font-body text-ink antialiased`}
    >
      <main className="w-full max-w-md">
        <div className="border border-line px-6 py-12 text-center sm:px-10 sm:py-16">
          {card.theme.monogram ? (
            <Monogram name={card.wedding.name} className="mb-8 block text-3xl text-muted" />
          ) : null}

          <p className="text-[0.7rem] uppercase tracking-[0.2em] text-muted">
            {card.householdName}
          </p>

          <p className="mt-6 text-[0.95rem] leading-relaxed text-muted">
            request the pleasure of your company at the marriage of
          </p>

          <h1 className="mt-4 font-script text-5xl leading-[1.05] text-ink sm:text-6xl">{names}</h1>

          <FloralRule className="my-8" />

          {dateLabel ? (
            <p className="text-[0.78rem] uppercase tracking-[0.2em] text-muted">{dateLabel}</p>
          ) : null}
          {card.hero.location ? (
            <p className="mt-2 text-[1.0625rem] text-muted">{card.hero.location}</p>
          ) : null}

          <Link
            href={`/rsvp/${token}`}
            className="mt-10 inline-block border border-accent px-6 py-2.5 text-[0.72rem] uppercase tracking-[0.14em] text-accent hover:bg-accent hover:text-paper"
          >
            See the details
          </Link>
        </div>

        <p className="mt-6 text-center text-[0.85rem] text-muted">
          This link is personal to your household — it&rsquo;s how we know who&rsquo;s replying.{" "}
          <Link href={`/w/${card.wedding.slug}`} className="text-accent underline underline-offset-2">
            The full details are here
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
