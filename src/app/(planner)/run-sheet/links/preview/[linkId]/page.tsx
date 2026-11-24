import Link from "next/link";
import { notFound } from "next/navigation";
import { MyDayView } from "@/components/day-link/my-day-view";
import "@/components/day-link/day-link.css";
import { createClient } from "@/lib/supabase/server";
import { dayLinkTints } from "@/lib/day-links/tint";
import { resolveTheme, themeTokens } from "@/lib/theme/presets";
import { loadMyDay } from "@/server/day-links/my-day";
import { assigneeOfLink } from "@/server/day-links/resolve";
import { requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "See what they see" };
export const dynamic = "force-dynamic";

/**
 * "See what they see" (spec 54 §10.5): a helper's own page, read-only, for the
 * couple. It reads through the same loader as the link, records nothing, and
 * sends no tap (the view is `readOnly`), so previewing never marks anything
 * opened or seen.
 */
export default async function PreviewPage({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await params;
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { data: link, error } = await supabase.from("day_links").select("*").eq("id", linkId).eq("wedding_id", wedding.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!link) notFound();

  const [data, theme] = await Promise.all([
    loadMyDay({
      link,
      assignee: assigneeOfLink(link),
      wedding: { id: wedding.id, name: wedding.name, timezone: wedding.timezone, wedding_date: wedding.wedding_date },
    }),
    supabase.from("site_content").select("payload").eq("wedding_id", wedding.id).eq("block_key", "theme").maybeSingle(),
  ]);
  const tints = dayLinkTints(themeTokens(resolveTheme(theme.data?.payload ?? null)).accent);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        <Link href="/run-sheet/links" className="underline">Day links</Link> · This is {link.label}&rsquo;s page. Nothing you tap here is sent.
      </p>
      <div className="dl mx-auto max-w-md overflow-hidden rounded-2xl border border-line" style={{ ["--dl-tint-light" as string]: tints.light, ["--dl-tint-dark" as string]: tints.dark }}>
        <MyDayView
          token="preview-only-not-a-token"
          helperName={link.label.split(" ")[0] ?? link.label}
          wedding={{ name: wedding.name, timeZone: wedding.timezone, date: wedding.wedding_date }}
          initial={data}
          vapidKey={null}
          readOnly
        />
      </div>
    </div>
  );
}
