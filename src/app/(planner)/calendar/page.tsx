import { CalendarView } from "@/components/lists/calendar-view";
import { SubTabs } from "@/components/sub-tabs";
import { TASKS_TABS } from "@/lib/nav-tabs";
import { getTimelineItems } from "@/server/queries/lists";
import { requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const wedding = await requireWedding();
  const items = await getTimelineItems(wedding.id);

  return (
    <div className="space-y-4">
      <SubTabs tabs={TASKS_TABS} />
      <h1 className="font-serif text-2xl">Calendar</h1>
      <CalendarView items={items} windowDays={wedding.reminder_window_days} timezone={wedding.timezone} />
    </div>
  );
}
