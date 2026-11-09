import { formatRelative } from "@/lib/format";

/**
 * When the household last opened their save the date (0031).
 *
 * Its "Copy link" moved to the household's Links menu (spec 47 §4.5), with
 * the household's other links.
 */
export function SaveTheDateOpened({
  lastViewedAt,
  viewCount,
}: {
  lastViewedAt: string | null;
  viewCount: number;
}) {
  if (!lastViewedAt) return <span className="text-xs text-muted">Not opened</span>;
  return (
    <span
      className="whitespace-nowrap text-xs"
      title={`Opened ${viewCount} ${viewCount === 1 ? "time" : "times"}`}
    >
      Opened{viewCount > 1 ? <span className="text-muted"> {viewCount}×</span> : null}
      <span className="text-muted"> · {formatRelative(lastViewedAt)}</span>
    </span>
  );
}
