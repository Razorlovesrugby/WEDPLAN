import type { Metadata } from "next";
import { CatererExport, FloristExport, HireExport, PaperStyle, VenueExport, isExportView, parsePaper } from "@/components/seating/exports";
import { PrintButton } from "@/components/seating/print-button";
import { parseColourBy } from "@/lib/seating/colour";
import { createAdminClient } from "@/lib/supabase/admin";
import { signPath } from "@/lib/supabase/storage";
import { loadSeatingPlan } from "@/server/queries/seating";
import { checkShare } from "@/server/seating-share";

/** The exports behind a shared plan: the same print views the couple has, read through the same link. */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seating exports", robots: { index: false, follow: false } };

export default async function SharedSeatingPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ view?: string; paper?: string; orient?: string; spaces?: string; vendor?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const check = await checkShare(token);
  if (check.status !== "ok" || !check.eventId || !check.weddingId) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="font-serif text-2xl">This link isn&rsquo;t active</h1>
        <p className="mt-2 text-sm text-muted">Open the shared plan again and enter the passcode, or ask the couple for a new link.</p>
      </main>
    );
  }
  const view = isExportView(sp.view) ? sp.view : "caterer";
  const paper = parsePaper(sp.paper, sp.orient);
  const supabase = createAdminClient();
  const [data, event] = await Promise.all([
    loadSeatingPlan(supabase, check.weddingId, check.eventId),
    supabase.from("events").select("name").eq("id", check.eventId).eq("wedding_id", check.weddingId).maybeSingle(),
  ]);
  const backgrounds = Object.fromEntries(await Promise.all(data.spaces.map(async (s) => [s.id, s.background_path ? await signPath(s.background_path) : null] as const)));
  const input = { data, eventName: event.data?.name ?? "Seating", paper, spaceIds: (sp.spaces ?? "").split(",").filter(Boolean), backgrounds, colourBy: parseColourBy(data.plan?.colour_by), vendorId: data.vendors.some((v) => v.id === sp.vendor) ? sp.vendor : null };

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <PaperStyle paper={paper} />
      <div className="no-print flex items-center gap-2">
        <a href={`/p/${token}`} className="btn">
          ← Back to the plan
        </a>
        <span className="ml-auto">
          <PrintButton />
        </span>
      </div>
      {view === "caterer" ? <CatererExport {...input} /> : view === "venue" ? <VenueExport {...input} /> : view === "florist" ? <FloristExport {...input} /> : <HireExport {...input} />}
    </main>
  );
}
