import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveCardByAddress } from "@/server/rsvp/card";
import { loadSaveTheDateContent } from "@/server/queries/save-the-date";
import { saveTheDateDisplay } from "@/lib/site/save-the-date";
import { splitHeadline } from "@/lib/site/names";
import { PALETTES, themeTokens } from "@/lib/theme/presets";

/**
 * The link preview for a save-the-date.
 *
 * The save-the-date *is* a link pasted into a chat, so this image is the first
 * thing anybody sees of it — before they tap, and for everybody who never
 * does. Set in the same editorial register as the page: the eyebrow, the names
 * large with the ampersand dropped to its own line, and the date under a rule.
 *
 * Type only, no photograph. The photos are WebP in a private bucket, and
 * Satori's image support is the thing most likely to fail silently here; a
 * failed preview is a bare URL, which reads as spam. EB Garamond rather than
 * the page's Fraunces because only the .ttf copies in `src/lib/fonts/og` can
 * be read by Satori (see the household page's image for that story).
 */

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Save the date";

async function loadFont(file: string): Promise<ArrayBuffer> {
  const buffer = await readFile(path.join(process.cwd(), "src/lib/fonts/og", file));
  return Uint8Array.from(buffer).buffer;
}

export default async function OpengraphImage({
  params,
}: {
  params: { slug: string; household: string };
}) {
  const card = await resolveCardByAddress(params.slug, params.household);
  const saved = card ? await loadSaveTheDateContent(card.wedding.id) : null;
  const font = await loadFont("EBGaramond.ttf");

  const tokens = saved
    ? saved.content.palette === "site"
      ? themeTokens(saved.siteTheme)
      : PALETTES[saved.content.palette].tokens
    : PALETTES.ivory.tokens;

  const display = card && saved ? saveTheDateDisplay(saved.content, card.wedding) : null;
  const headline = display?.headline ?? "Save the date";
  const split = splitHeadline(headline);
  const long = headline.length > 26;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: tokens.paper,
        color: tokens.ink,
        fontFamily: "Garamond",
        padding: "64px 84px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 22,
          letterSpacing: 7,
          textTransform: "uppercase",
          color: tokens.muted,
        }}
      >
        <span>{display?.eyebrow ?? "Save the date"}</span>
        {card ? <span>For {card.householdName.slice(0, 32)}</span> : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {split && !long ? (
          <>
            <div style={{ fontSize: 132, lineHeight: 0.9, letterSpacing: -3 }}>{split.left}</div>
            <div
              style={{
                fontSize: 56,
                fontStyle: "italic",
                lineHeight: 1.3,
                color: tokens.accent,
              }}
            >
              {split.joiner}
            </div>
            <div style={{ fontSize: 132, lineHeight: 0.9, letterSpacing: -3 }}>{split.right}</div>
          </>
        ) : (
          <div
            style={{
              fontSize: long ? 84 : 120,
              lineHeight: 1,
              letterSpacing: -2,
            }}
          >
            {headline.length > 60 ? `${headline.slice(0, 59)}…` : headline}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          borderTop: `2px solid ${tokens.line}`,
          paddingTop: 22,
        }}
      >
        <span style={{ fontSize: 44 }}>{display?.dateLabel ?? ""}</span>
        <span
          style={{
            fontSize: 22,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: tokens.muted,
          }}
        >
          {display?.location?.slice(0, 40) ?? ""}
        </span>
      </div>
    </div>,
    {
      ...size,
      fonts: [{ name: "Garamond", data: font, style: "normal", weight: 400 }],
    },
  );
}
