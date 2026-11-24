import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayLinkTints } from "@/lib/day-links/tint";
import { initialsOf } from "@/lib/day-links/initials";
import { resolveTheme, themeTokens } from "@/lib/theme/presets";
import { resolveDayLink } from "@/server/day-links/resolve";

/** The wedding's initials on a tint-coloured square (spec 54 §5.7). */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveDayLink(token);
  if (!resolved.ok) return new Response("Not found", { status: 404 });

  const size = new URL(request.url).searchParams.get("size") === "512" ? 512 : 192;
  const { data } = await createAdminClient()
    .from("site_content")
    .select("payload")
    .eq("wedding_id", resolved.context.wedding.id)
    .eq("block_key", "theme")
    .maybeSingle();
  const tint = dayLinkTints(themeTokens(resolveTheme(data?.payload ?? null)).accent).light;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: tint,
          color: "#fff",
          fontSize: size * 0.4,
          fontWeight: 700,
          letterSpacing: -2,
        }}
      >
        {initialsOf(resolved.context.wedding.name)}
      </div>
    ),
    { width: size, height: size, headers: { "cache-control": "private, max-age=3600" } },
  );
}
