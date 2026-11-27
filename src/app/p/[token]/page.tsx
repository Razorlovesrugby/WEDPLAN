import type { Metadata } from "next";
import { SharedPlan } from "@/components/seating/shared-plan";
import { SharedPasscodeForm } from "@/components/seating/shared-passcode-form";
import { shareRefusal } from "@/lib/seating/share";
import { createAdminClient } from "@/lib/supabase/admin";
import { signPath } from "@/lib/supabase/storage";
import { loadSeatingPlan } from "@/server/queries/seating";
import { checkShare } from "@/server/seating-share";

/**
 * A seating plan shared by link (spec 57 E.3). No account, no app chrome, and
 * never indexed. Whether the link opens is the database's answer (token,
 * passcode, expiry); what is read after that is scoped to the one event it
 * names. It shows the live layout as it is when opened, and changes nothing.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seating plan", robots: { index: false, follow: false } };

export default async function SharedSeatingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const check = await checkShare(token);
  if (check.status === "passcode_required" || check.status === "wrong_passcode") {
    return (
      <main className="mx-auto max-w-sm px-6 py-24">
        <h1 className="font-serif text-2xl">This plan has a passcode</h1>
        <SharedPasscodeForm token={token} />
      </main>
    );
  }
  if (check.status !== "ok" || !check.eventId || !check.weddingId) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="font-serif text-2xl">This link isn&rsquo;t active</h1>
        <p className="mt-2 text-sm text-muted">{shareRefusal(check.status)}</p>
      </main>
    );
  }

  const supabase = createAdminClient();
  const [data, event] = await Promise.all([
    loadSeatingPlan(supabase, check.weddingId, check.eventId),
    supabase.from("events").select("name").eq("id", check.eventId).eq("wedding_id", check.weddingId).maybeSingle(),
  ]);
  const backgrounds = Object.fromEntries(await Promise.all(data.spaces.map(async (s) => [s.id, s.background_path ? await signPath(s.background_path) : null] as const)));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <SharedPlan data={data} eventName={event.data?.name ?? "Seating"} token={token} backgrounds={backgrounds} />
    </main>
  );
}
