import { DayMaster } from "@/components/day-master/day-master";
import { getMasterData } from "@/server/queries/day-master";
import { requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "On the day" };
export const dynamic = "force-dynamic";

/** The on-the-day master (spec 55): readiness before, live on the day, a summary after. */
export default async function DayPage() {
  const wedding = await requireWedding();
  const data = await getMasterData({
    id: wedding.id,
    timezone: wedding.timezone,
    day_lead_person_id: wedding.day_lead_person_id,
    day_lead_user_id: wedding.day_lead_user_id,
  });
  return <DayMaster data={data} timeZone={wedding.timezone} weddingName={wedding.name} />;
}
