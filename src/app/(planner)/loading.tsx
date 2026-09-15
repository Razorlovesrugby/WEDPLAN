/**
 * Shown the instant you click a planner nav link, before the destination's
 * data has come back — without it, Next.js renders nothing at all during
 * that wait, which is what made navigation feel stalled. Generic on purpose:
 * it wraps every page under this layout (guests, lists, board, ...) unless
 * one of them defines its own more specific loading.tsx.
 */
export default function PlannerLoading() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="flex items-center justify-between gap-2">
        <div className="skeleton h-7 w-40" />
        <div className="skeleton h-8 w-24" />
      </div>
      <div className="card divide-y divide-line/60 px-4 py-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <div className="skeleton h-4 w-4 shrink-0 rounded-full" />
            <div className="skeleton h-4 flex-1" style={{ maxWidth: `${70 - i * 6}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
