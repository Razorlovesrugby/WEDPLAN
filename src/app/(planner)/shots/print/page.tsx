import { getShotList } from "@/server/queries/shots";
import { requireWedding } from "@/server/queries/wedding";
import { slotFit } from "@/lib/shots/progress";

export const metadata = { title: "Shot list — print" };

/** One section per page, people listed per shot, must-haves marked: a paper backup (spec 52 §6). */
export default async function ShotsPrintPage() {
  const wedding = await requireWedding();
  const { sections } = await getShotList(wedding.id);
  const time = (iso: string) =>
    new Intl.DateTimeFormat("en-NZ", { timeZone: wedding.timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));

  return (
    <div className="mx-auto max-w-2xl p-6 print:p-0">
      <h1 className="mb-4 font-serif text-2xl print:hidden">Shot list — print</h1>
      {sections
        .filter((s) => s.shots.length > 0)
        .map((s) => {
          const fit = slotFit(s.shots, s.startsAt, s.endsAt);
          return (
            <section key={s.id} className="mb-8 break-after-page">
              <h2 className="font-serif text-xl">{s.name}</h2>
              <p className="text-sm text-muted">
                {s.startsAt && s.endsAt ? `${time(s.startsAt)}–${time(s.endsAt)}` : "Any time"}
                {s.location ? ` · ${s.location}` : ""}
                {fit ? ` · ${fit.groups} groups, about ${fit.minutes} of ${fit.slotMinutes} minutes` : ""}
              </p>
              <ol className="mt-3 space-y-2">
                {s.shots.map((shot, i) => (
                  <li key={shot.id} className="text-sm">
                    <span className="mr-2 inline-block w-5 text-right text-muted">{i + 1}.</span>
                    <strong>{shot.mustHave ? "★ " : ""}{shot.title}</strong>
                    {shot.people.length ? <span className="block pl-7 text-muted">{shot.people.map((p) => p.name).join(", ")}</span> : null}
                    {shot.note ? <span className="block pl-7 italic">{shot.note}</span> : null}
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
    </div>
  );
}
