import Link from "next/link";
import { requireWedding } from "@/server/queries/wedding";
import { SongList } from "@/components/site/editor/song-list";
import { getPlannerSongs } from "@/server/queries/site-extras";

export const metadata = { title: "Song requests" };

/**
 * The list you hand the DJ (spec 23 §8, spec 31 §7).
 *
 * Ranked as guests see it, with who voted. Here is where a song is hidden,
 * merged with its twin, given the couple's ♥, or marked played on the night —
 * which is what puts "Now playing" on every guest's chart.
 */
export default async function SongRequestsPage() {
  const wedding = await requireWedding();
  const rows = await getPlannerSongs(wedding.id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl">Song requests</h1>
          <p className="mt-1 text-sm text-muted">
            {rows.length === 0
              ? "Nothing yet. Add the song requests block to your site and they arrive here."
              : `${rows.length} ${rows.length === 1 ? "request" : "requests"}, ranked the way your guests see them. The do-not-play list lives on the Song requests block.`}
          </p>
        </div>
        <Link href="/site" className="btn">
          Back to the site
        </Link>
      </div>

      <SongList rows={rows} timeZone={wedding.timezone} />
    </div>
  );
}
