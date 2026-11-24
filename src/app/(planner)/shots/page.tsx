import { ShotsScreen } from "@/components/shots/shots-screen";
import { getShotList } from "@/server/queries/shots";
import { requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Shot list" };

export default async function ShotsPage() {
  const wedding = await requireWedding();
  const data = await getShotList(wedding.id);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl">Shot list</h1>
      <ShotsScreen data={data} timeZone={wedding.timezone} />
    </div>
  );
}
