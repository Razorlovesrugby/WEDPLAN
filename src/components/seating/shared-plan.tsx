import { dietaryText, hasAllergy, hasAnyDietary } from "@/lib/dietary";
import { guestColour, parseColourBy } from "@/lib/seating/colour";
import { tableCounts } from "@/lib/seating/item-lines";
import { compareBySurname, guestName } from "@/lib/seating/model";
import { buildKitchen, mealQuestion } from "@/lib/seating/kitchen";
import { parseSettings } from "@/lib/seating/plan-settings";
import { SERVICE_LABEL, isServiceStyle, parseMenu } from "@/lib/seating/service";
import { SHARE_WARNING } from "@/lib/seating/share";
import { pluralise } from "@/lib/format";
import type { SeatingPlanData } from "@/server/queries/seating";
import { KitchenSummaryView } from "./exports";
import { PlanDrawing, type PlanSeat } from "./plan-drawing";
import { ZoomPlan } from "./zoom-plan";

/**
 * A shared plan, as the person with the link sees it (spec 57 E.3): the event's
 * live layout, every space with names, colours and allergies, the kitchen
 * summary and the guests A to Z. View only: nothing here writes.
 */
export function SharedPlan({
  data,
  eventName,
  token,
  backgrounds,
}: {
  data: SeatingPlanData;
  eventName: string;
  token: string;
  backgrounds: Record<string, string | null>;
}) {
  const colourBy = parseColourBy(data.plan?.colour_by);
  const guests = new Map(data.guests.map((g) => [g.id, g]));
  const seats = new Map<string, Map<number, PlanSeat>>();
  for (const a of data.assignments) {
    const g = guests.get(a.guestId);
    if (!g || a.seatIndex === null) continue;
    const m = seats.get(a.tableId) ?? new Map<number, PlanSeat>();
    m.set(a.seatIndex, { label: guestName(g), colour: guestColour(g, colourBy, data.colour)?.colour ?? null, allergy: hasAllergy(g.dietaryNeeds), dot: hasAnyDietary(g.dietaryNeeds, g.dietary) });
    seats.set(a.tableId, m);
  }
  const { seatedAt } = tableCounts(data.assignments, data.blocked);
  const parsedMenu = parseMenu(data.plan?.menu);
  const menu = parsedMenu.ok ? parsedMenu.menu : [];
  const defaultStyle = isServiceStyle(data.plan?.service_style) ? data.plan.service_style : "plated";
  const meal = mealQuestion(data.colour.questions, data.colour.answers, colourBy.kind === "question" ? colourBy.questionId : null);
  const kitchen = buildKitchen({ menu, defaultStyle, tables: data.tables, seats: data.assignments, guests: data.guests, settings: parseSettings(data.plan?.settings), meal });
  const tableById = new Map(data.tables.map((t) => [t.id, t]));
  const spaceName = new Map(data.spaces.map((s) => [s.id, s.name]));
  const seated = data.assignments.filter((a) => guests.has(a.guestId));

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-serif text-3xl">{eventName} — seating</h1>
        <p className="text-sm text-muted">
          A view-only plan, as it is now. {SHARE_WARNING} You can open the exports below; you can&rsquo;t change anything.
        </p>
        <p className="no-print flex flex-wrap gap-2 pt-1 text-sm">
          {(
            [
              ["caterer", "Caterer's pack"],
              ["venue", "Venue plan"],
              ["florist", "Florist's plan"],
              ["hire", "Hire list"],
            ] as const
          ).map(([v, label]) => (
            <a key={v} className="btn" href={`/p/${token}/print?view=${v}`}>
              {label}
            </a>
          ))}
        </p>
      </header>

      {data.spaces.map((space) => (
        <section key={space.id} className="space-y-2">
          <h2 className="font-serif text-xl">{space.name}</h2>
          {/* Pinch or Ctrl/⌘ + scroll to zoom, drag to pan when zoomed; a plain scroll still scrolls this page (spec 60 D.1). */}
          <ZoomPlan label={`${space.name} plan`}>
            <PlanDrawing space={space} tables={data.tables} fixtures={data.fixtures} customItems={data.customItems} marquees={data.marquees} backgroundUrl={backgrounds[space.id] ?? null} backgroundOpacity={space.background_opacity} options={{ venue: true, furniture: true, decor: true, chairs: "numbered", seats, tableText: "label_count", seatedAt }} />
          </ZoomPlan>
        </section>
      ))}

      <section className="space-y-2">
        <h2 className="font-serif text-xl">Kitchen summary</h2>
        <KitchenSummaryView kitchen={kitchen} defaultStyle={SERVICE_LABEL[defaultStyle]} hasMenu={menu.length > 0} />
      </section>

      <section className="space-y-2">
        <h2 className="font-serif text-xl">Guests A to Z</h2>
        <p className="text-sm text-muted">{pluralise(seated.length, "guest")} seated.</p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-1 pr-3 font-medium">Guest</th>
              <th className="py-1 pr-3 font-medium">Space</th>
              <th className="py-1 pr-3 font-medium">Table</th>
              <th className="py-1 pr-3 font-medium">Seat</th>
              <th className="py-1 font-medium">Dietary</th>
            </tr>
          </thead>
          <tbody>
            {seated
              .map((a) => ({ g: guests.get(a.guestId)!, t: tableById.get(a.tableId), seat: a.seatIndex }))
              .sort((x, y) => compareBySurname(x.g, y.g))
              .map((r) => (
                <tr key={r.g.id} className="border-b border-line/60 align-top">
                  <td className="py-1 pr-3">{guestName(r.g)}</td>
                  <td className="py-1 pr-3">{spaceName.get(r.t?.space_id ?? "") ?? ""}</td>
                  <td className="py-1 pr-3">{r.t?.label ?? ""}</td>
                  <td className="py-1 pr-3">{r.seat === null ? "" : r.seat + 1}</td>
                  <td className={`py-1 ${hasAllergy(r.g.dietaryNeeds) ? "font-medium text-[#c81e1e]" : ""}`}>{dietaryText(r.g.dietaryNeeds, r.g.dietary)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
