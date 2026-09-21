import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { SongList } from "@/components/site/editor/song-list";
import type { SongRequestRow } from "@/lib/types/database";

export const metadata = { title: "Song requests" };

/**
 * The list you hand the DJ (spec 23 §8).
 *
 * Planner-facing, deliberately: the form is open to anyone with the site
 * address, and an open form that publishes what it receives is a billboard.
 * Nothing a guest types is rendered back onto the public page — it arrives
 * here, and here is where it is approved, marked played, or thrown away.
 */
export default async function SongRequestsPage() {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data } = await supabase
    .from("song_requests")
    .select("*, households(display_name)")
    .eq("wedding_id", wedding.id)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as (SongRequestRow & {
    households: { display_name: string } | null;
  })[];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl">Song requests</h1>
          <p className="mt-1 text-sm text-muted">
            {rows.length === 0
              ? "Nothing yet. Add the song requests block to your site and they arrive here."
              : `${rows.length} ${rows.length === 1 ? "request" : "requests"}`}
          </p>
        </div>
        <Link href="/site" className="btn">
          Back to the site
        </Link>
      </div>

      <SongList
        rows={rows.map((row) => ({
          id: row.id,
          title: row.title,
          artist: row.artist,
          status: row.status,
          createdAt: row.created_at,
          // A request from a household's own page is attributed automatically;
          // one from the shared site carries whatever name was typed, or none.
          askedBy: row.households?.display_name ?? row.asked_by,
        }))}
      />
    </div>
  );
}
