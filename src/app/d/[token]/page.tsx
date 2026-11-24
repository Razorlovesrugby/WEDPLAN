import type { Metadata, Viewport } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayLinkTints } from "@/lib/day-links/tint";
import { resolveTheme, themeTokens } from "@/lib/theme/presets";
import { serverEnv } from "@/lib/env";
import { loadMyDay } from "@/server/day-links/my-day";
import { resolveDayLink } from "@/server/day-links/resolve";
import { MyDayView } from "@/components/day-link/my-day-view";
import "@/components/day-link/day-link.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "My day",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    manifest: `/d/${token}/manifest.webmanifest`,
    icons: { apple: `/d/${token}/icon?size=192` },
    appleWebApp: { capable: true, title: "My day", statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
};

const CLOSED: Record<string, { title: string; body: string }> = {
  off: { title: "This link has been turned off", body: "Ask the couple for a new one." },
  expired: { title: "This link has stopped working", body: "Thanks for helping." },
  throttled: { title: "Too many tries", body: "Wait a few minutes and open the link again." },
  malformed: { title: "This link isn't right", body: "Check you copied all of it, or ask the couple to send it again." },
  not_found: { title: "This link isn't right", body: "Check you copied all of it, or ask the couple to send it again." },
};

export default async function DayLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveDayLink(token);

  if (!resolved.ok) {
    const message = CLOSED[resolved.reason] ?? CLOSED.not_found!;
    return (
      <div className="dl" style={{ ["--dl-tint-light" as string]: "#0a62c9", ["--dl-tint-dark" as string]: "#64a8ff" }}>
        <div className="dl-wrap" style={{ paddingTop: 64 }}>
          <h1 className="dl-large">{message.title}</h1>
          <p className="dl-sub" style={{ marginTop: 8 }}>{message.body}</p>
        </div>
      </div>
    );
  }

  const { context } = resolved;
  const supabase = createAdminClient();
  const [data, themeRow] = await Promise.all([
    loadMyDay(context),
    supabase.from("site_content").select("payload").eq("wedding_id", context.wedding.id).eq("block_key", "theme").maybeSingle(),
  ]);
  // The link's label is the person's name, written when it was made.
  const helperName = context.link.label.split(" ")[0] ?? context.link.label;
  const tints = dayLinkTints(themeTokens(resolveTheme(themeRow.data?.payload ?? null)).accent);

  return (
    <div className="dl" style={{ ["--dl-tint-light" as string]: tints.light, ["--dl-tint-dark" as string]: tints.dark }}>
      <MyDayView
        token={token}
        helperName={helperName}
        wedding={{ name: context.wedding.name, timeZone: context.wedding.timezone, date: context.wedding.wedding_date }}
        initial={data}
        vapidKey={serverEnv().VAPID_PUBLIC_KEY && serverEnv().VAPID_PRIVATE_KEY ? serverEnv().VAPID_PUBLIC_KEY! : null}
      />
    </div>
  );
}
