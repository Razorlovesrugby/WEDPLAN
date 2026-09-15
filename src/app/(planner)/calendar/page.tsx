import { CalendarView } from "@/components/lists/calendar-view";
import { getTimelineItems } from "@/server/queries/lists";
import { requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const wedding = await requireWedding();
  const items = await getTimelineItems(wedding.id);

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl">Calendar</h1>
      <CalendarView items={items} windowDays={wedding.reminder_window_days} />
    </div>
  );
}
