import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveCard } from "@/server/rsvp/card";
import { themeTokens } from "@/lib/theme/presets";
import { monogramFromName } from "@/lib/site/names";
import { formatDate } from "@/lib/format";

/**
 * The preview image for the stationery card (spec 14 §12.2).
 *
 * Without it a forwarded WhatsApp message is a bare URL, which reads as spam —
 * this is the difference between "someone sent me a link" and "I have been
 * invited to a wedding".
 *
 * **Separate .ttf files, deliberately.** Satori, which renders this, reads
 * TTF, OTF and WOFF but *not* WOFF2 — and WOFF2 is what the site itself uses
 * because it is roughly half the size over the wire. So the same two families
 * exist twice in the repo, in two formats, for two renderers. Deleting the
 * .ttf copies to "tidy up" breaks this route and nothing else, silently, only
 * in the preview.
 */

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Wedding invitation";

/**
 * Read from the filesystem rather than importing the bytes.
 *
 * `process.cwd()` is the project root in both dev and a built server, and the
 * files are traced into the bundle because this path is statically analysable.
 */
async function loadFont(file: string): Promise<ArrayBuffer> {
  const buffer = await readFile(path.join(process.cwd(), "src/lib/fonts/og", file));
  return Uint8Array.from(buffer).buffer;
}

export default async function OpengraphImage({ params }: { params: { token: string } }) {
  const card = await resolveCard(params.token);

  const [scriptFont, bodyFont] = await Promise.all([
    loadFont("PinyonScript.ttf"),
    loadFont("EBGaramond.ttf"),
  ]);

  const tokens = card ? themeTokens(card.theme) : { ink: "#2b2724", paper: "#fbf8f3", muted: "#6b625a", line: "#e7e0d5", accent: "#7a5c3c" };
  // With no card there is nothing to name, so the eyebrow is dropped and the
  // script line carries the whole message — otherwise the fallback reads
  // "YOU ARE INVITED / You're invited", which looks like a bug because it is.
  const names = card ? (card.hero.headline ?? card.wedding.name) : "You're invited";
  const dateLabel = card
    ? (card.hero.dateLabel ??
      (card.wedding.wedding_date ? formatDate(card.wedding.wedding_date, card.wedding.timezone) : null))
    : null;
  const mono = card && card.theme.monogram ? monogramFromName(card.wedding.name) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: tokens.paper,
          fontFamily: "Body",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            border: `2px solid ${tokens.line}`,
            padding: "56px 80px",
            width: 1040,
            height: 470,
          }}
        >
          {mono ? (
            <div style={{ fontFamily: "Script", fontSize: 46, color: tokens.muted, marginBottom: 22 }}>
              {mono.left} &amp; {mono.right}
            </div>
          ) : null}

          {card ? (
            <div
              style={{
                fontSize: 22,
                letterSpacing: 6,
                textTransform: "uppercase",
                color: tokens.muted,
                marginBottom: 26,
              }}
            >
              You are invited
            </div>
          ) : null}

          {/* Satori has no text-wrapping heuristics worth relying on, so the
              names are capped rather than allowed to overflow the card. */}
          <div style={{ fontFamily: "Script", fontSize: 104, color: tokens.ink, textAlign: "center", lineHeight: 1.05 }}>
            {names.length > 40 ? `${names.slice(0, 39)}…` : names}
          </div>

          {dateLabel ? (
            <div style={{ fontSize: 26, letterSpacing: 5, textTransform: "uppercase", color: tokens.muted, marginTop: 30 }}>
              {dateLabel}
            </div>
          ) : null}
          {card?.hero.location ? (
            <div style={{ fontSize: 28, color: tokens.muted, marginTop: 10 }}>{card.hero.location}</div>
          ) : null}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Script", data: scriptFont, style: "normal", weight: 400 },
        { name: "Body", data: bodyFont, style: "normal", weight: 400 },
      ],
    },
  );
}
