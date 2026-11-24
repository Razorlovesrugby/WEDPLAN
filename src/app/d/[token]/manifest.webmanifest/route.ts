import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayLinkTints } from "@/lib/day-links/tint";
import { resolveTheme, themeTokens } from "@/lib/theme/presets";
import { resolveDayLink } from "@/server/day-links/resolve";

/**
 * The link as an installable app (spec 54 §5.7): the wedding's name, the
 * wedding's initials on a tint-coloured icon, full screen. Scoped to this one
 * link, since its URL is the credential.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveDayLink(token);
  if (!resolved.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data } = await createAdminClient()
    .from("site_content")
    .select("payload")
    .eq("wedding_id", resolved.context.wedding.id)
    .eq("block_key", "theme")
    .maybeSingle();
  const tint = dayLinkTints(themeTokens(resolveTheme(data?.payload ?? null)).accent).light;

  const base = `/d/${token}`;
  return NextResponse.json(
    {
      name: `${resolved.context.wedding.name} · my day`,
      short_name: "My day",
      start_url: base,
      scope: base,
      display: "standalone",
      background_color: "#f2f2f7",
      theme_color: tint,
      icons: [
        { src: `${base}/icon?size=192`, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: `${base}/icon?size=512`, sizes: "512x512", type: "image/png", purpose: "any" },
      ],
    },
    { headers: { "content-type": "application/manifest+json", "cache-control": "private, no-store" } },
  );
}
