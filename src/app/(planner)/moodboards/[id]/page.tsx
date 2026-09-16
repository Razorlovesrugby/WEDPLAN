import Link from "next/link";
import { notFound } from "next/navigation";
import { BoardGrid } from "@/components/moodboards/board-grid";
import { ShareCard } from "@/components/moodboards/share-card";
import { BoardHeader } from "@/components/moodboards/board-header";
import {
  getMoodboard,
  listMoodboardItems,
  listShares,
  signItems,
} from "@/server/queries/moodboards";
import { requireWedding } from "@/server/queries/wedding";

export default async function MoodboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wedding = await requireWedding();

  const board = await getMoodboard(wedding.id, id);
  if (!board) notFound();

  const [rows, shares] = await Promise.all([
    // includePending: this is the one screen that must show a failed upload,
    // because it is the only place it can be retried or removed.
    listMoodboardItems(wedding.id, id, { includePending: true }),
    listShares(wedding.id, id),
  ]);

  const items = await signItems(rows);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/moodboards" className="text-sm text-muted underline">
          ← All boards
        </Link>
        <Link href={`/moodboards/${id}/import`} className="btn">
          Import from Pinterest
        </Link>
      </div>

      <BoardHeader board={board} />

      <BoardGrid moodboardId={id} items={items} weddingId={wedding.id} />

      <ShareCard moodboardId={id} shares={shares} />
    </div>
  );
}
