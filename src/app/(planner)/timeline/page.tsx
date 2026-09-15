import { TimelineView } from "@/components/lists/timeline-view";
import { getTimelineItems } from "@/server/queries/lists";
import { requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Timeline" };

export default async function TimelinePage() {
  const wedding = await requireWedding();
  const items = await getTimelineItems(wedding.id);

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl">Timeline</h1>
      <TimelineView items={items} />
    </div>
  );
}
