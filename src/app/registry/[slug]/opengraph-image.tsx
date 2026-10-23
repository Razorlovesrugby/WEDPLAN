import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePalette } from "@/lib/registry/look";

/**
 * The link preview for the registry (spec 36 §4.1) — what shows when the
 * address is pasted into a chat, which is the main way it travels.
 *
 * Type only, in the registry's own palette, for the reason the save-the-date's
 * image gives: Satori's image support fails silently and a failed preview is a
 * bare URL, which reads as spam. A registry that is off, unknown or unreadable
 * gets the same neutral card, so the image can't be used to ask what exists.
 */

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Our registry";

async function loadFont(file: string): Promise<ArrayBuffer> {
  const buffer = await readFile(path.join(process.cwd(), "src/lib/fonts/og", file));
  return Uint8Array.from(buffer).buffer;
}

export default async function OpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let heading = "Our registry";
  let paletteId: string | null = null;

  try {
    if (/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug)) {
      const admin = createAdminClient();
      const { data: wedding } = await admin.from("weddings").select("id, name").eq("slug", slug).maybeSingle();
      if (wedding) {
        const { data: settings } = await admin
          .from("registry_settings")
          .select("enabled, title, palette")
          .eq("wedding_id", wedding.id)
          .maybeSingle();
        if (settings?.enabled) {
          heading = settings.title || wedding.name;
          paletteId = settings.palette;
        }
      }
    }
  } catch {
    // A preview that can't read the database is the neutral card, never an error.
  }

  const { tokens } = resolvePalette(paletteId);
  const text = heading.length > 40 ? `${heading.slice(0, 39)}…` : heading;

  return new ImageResponse(
    (
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
        <div style={{ display: "flex", fontSize: 24, letterSpacing: 8, textTransform: "uppercase", color: tokens.muted }}>
          Our registry
        </div>
        <div style={{ display: "flex", fontSize: text.length > 22 ? 96 : 128, lineHeight: 1, letterSpacing: -2 }}>{text}</div>
        <div style={{ display: "flex", borderTop: `2px solid ${tokens.line}`, paddingTop: 22, fontSize: 30, fontStyle: "italic", color: tokens.accent }}>
          Things we&apos;d love, and a way to tell us you&apos;ve got one
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Garamond", data: await loadFont("EBGaramond.ttf"), style: "normal", weight: 400 }] },
  );
}
