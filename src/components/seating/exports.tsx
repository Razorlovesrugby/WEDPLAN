import type { ReactNode } from "react";
import { dietaryText, hasAllergy, hasAnyDietary } from "@/lib/dietary";
import { colourCounts, colourLegend, guestColour, type ColourBy } from "@/lib/seating/colour";
import { tableSize } from "@/lib/seating/geometry";
import { closeupFood, buildKitchen, mealQuestion, type Kitchen } from "@/lib/seating/kitchen";
import { effectiveStyle, parseStyleChanges, CENTRE_LABEL, type ItemLine, type TableStyle } from "@/lib/seating/items";
import { effectiveRules, parseTableItems, ruleItems, type TableItem } from "@/lib/seating/table-items";
import { itemLines, tableCounts } from "@/lib/seating/item-lines";
import { fixtureGroup } from "@/lib/seating/library";
import { compareBySurname, guestName, type SeatingTable } from "@/lib/seating/model";
import { parseSettings } from "@/lib/seating/plan-settings";
import { SERVICE_LABEL, isServiceStyle, parseMenu } from "@/lib/seating/service";
import { pluralise } from "@/lib/format";
import type { SeatingPlanData } from "@/server/queries/seating";
import { PlanDrawing, type PlanSeat } from "./plan-drawing";
import { TableCloseup } from "./table-closeup";

/** The exports a couple hands to suppliers (spec 57 Part E). Server-rendered print views. */
export const EXPORT_VIEWS = [
  ["caterer", "Caterer"],
  ["venue", "Venue"],
  ["florist", "Florist"],
  ["hire", "Hire company"],
] as const;
export type ExportView = (typeof EXPORT_VIEWS)[number][0];
export const isExportView = (v: unknown): v is ExportView => EXPORT_VIEWS.some(([k]) => k === v);

export type Paper = { size: "a4" | "a3"; orient: "portrait" | "landscape" };
export function parsePaper(size: unknown, orient: unknown): Paper {
  return { size: size === "a3" ? "a3" : "a4", orient: orient === "landscape" ? "landscape" : "portrait" };
}

export type ExportInput = {
  data: SeatingPlanData;
  eventName: string;
  paper: Paper;
  /** The spaces to include; empty means all of them. */
  spaceIds: readonly string[];
  /** The venue plan's signed address per space, if any. */
  backgrounds: Readonly<Record<string, string | null>>;
  colourBy: ColourBy;
};

const SHAPE_WORD: Record<string, string> = {
  round: "Round", long: "Long", square: "Square", head: "Head table", sweetheart: "Sweetheart", oval: "Oval", half_moon: "Half-moon",
  serpentine: "Serpentine", rows: "Ceremony rows", banquet: "Banquet run",
};

function Page({ title, children, last = false }: { title: string; children: ReactNode; last?: boolean }) {
  return (
    <section className="space-y-3" style={{ breakAfter: last ? "auto" : "page" }}>
      <h2 className="font-serif text-xl">{title}</h2>
      {children}
    </section>
  );
}

/** The paper the browser prints on. */
export function PaperStyle({ paper }: { paper: Paper }) {
  return <style>{`@media print { @page { size: ${paper.size.toUpperCase()} ${paper.orient}; margin: 10mm; } }`}</style>;
}

/** What is on a table's top: placed by hand, and placed by its rules (its own, or its style's). Spec 59 Part D. */
function tableTopItems(t: SeatingTable, styles: readonly TableStyle[]): (TableItem & { fromRule?: string })[] {
  const style = t.style_id ? styles.find((s) => s.id === t.style_id) : undefined;
  const rules = effectiveRules(style?.item_rules ?? [], parseStyleChanges(t.style_changes)?.item_rules ?? null);
  return [...parseTableItems(t.table_items), ...ruleItems(t, rules)];
}
/** Names for the dishes and the couple's own items that sit on tables. */
function itemNamesOf(i: ExportInput): Record<string, string> {
  const m = parseMenu(i.data.plan?.menu);
  return Object.fromEntries([...(m.ok ? m.menu : []).flatMap((c) => c.dishes.map((d) => [d.id, d.name] as const)), ...i.data.customItems.map((c) => [c.id, c.name] as const)]);
}

function chosenSpaces(i: ExportInput) {
  const wanted = new Set(i.spaceIds);
  const spaces = i.data.spaces.filter((s) => wanted.size === 0 || wanted.has(s.id));
  return spaces.length > 0 ? spaces : i.data.spaces;
}

function seatMap(i: ExportInput): Map<string, Map<number, PlanSeat>> {
  const guests = new Map(i.data.guests.map((g) => [g.id, g]));
  const out = new Map<string, Map<number, PlanSeat>>();
  for (const a of i.data.assignments) {
    const g = guests.get(a.guestId);
    if (!g || a.seatIndex === null) continue;
    const seats = out.get(a.tableId) ?? new Map<number, PlanSeat>();
    seats.set(a.seatIndex, { label: guestName(g), colour: guestColour(g, i.colourBy, i.data.colour)?.colour ?? null, allergy: hasAllergy(g.dietaryNeeds), dot: hasAnyDietary(g.dietaryNeeds, g.dietary) });
    out.set(a.tableId, seats);
  }
  return out;
}

function kitchenFor(i: ExportInput) {
  const parsed = parseMenu(i.data.plan?.menu);
  const menu = parsed.ok ? parsed.menu : [];
  const defaultStyle = isServiceStyle(i.data.plan?.service_style) ? i.data.plan.service_style : "plated";
  const settings = parseSettings(i.data.plan?.settings);
  const meal = mealQuestion(i.data.colour.questions, i.data.colour.answers, i.colourBy.kind === "question" ? i.colourBy.questionId : null);
  const kitchen = buildKitchen({ menu, defaultStyle, tables: i.data.tables, seats: i.data.assignments, guests: i.data.guests, settings, meal });
  return { menu, defaultStyle, kitchen, settings };
}

function lines(i: ExportInput, utensils: number): ItemLine[] {
  const { seatedAt, blockedAt } = tableCounts(i.data.assignments, i.data.blocked);
  return itemLines({
    tables: i.data.tables,
    seatedAt,
    blockedAt,
    styles: i.data.styles,
    fixtures: i.data.fixtures,
    customNames: Object.fromEntries(i.data.customItems.map((c) => [c.id, c.name])),
    utensils,
    counts: i.data.counts,
  });
}

const tableName = (t: SeatingTable) => t.label;

// ---------------------------------------------------------------------------
// Caterer (E.1)
// ---------------------------------------------------------------------------
export function CatererExport(i: ExportInput) {
  const { menu, defaultStyle, kitchen } = kitchenFor(i);
  const guests = new Map(i.data.guests.map((g) => [g.id, g]));
  const spaces = chosenSpaces(i);
  const seats = seatMap(i);
  const seatedAt = tableCounts(i.data.assignments, i.data.blocked).seatedAt;
  const seated = i.data.assignments.filter((a) => guests.has(a.guestId));
  const highchairs = seated.filter((a) => {
    const g = guests.get(a.guestId)!;
    return g.ageBand === "infant" || g.needsHighchair;
  }).length;
  const legend = colourLegend(i.colourBy, i.data.colour);
  const counts = colourCounts(seated.map((a) => guests.get(a.guestId)!), i.colourBy, i.data.colour);
  const tableById = new Map(i.data.tables.map((t) => [t.id, t]));
  const spaceName = new Map(i.data.spaces.map((s) => [s.id, s.name]));
  const where = (tableId: string, seat: number | null) => {
    const t = tableById.get(tableId);
    return { space: spaceName.get(t?.space_id ?? "") ?? "", table: t?.label ?? "", seat: seat === null ? "" : String(seat + 1) };
  };

  return (
    <div className="space-y-8">
      {spaces.map((space, n) => {
        const inSpace = new Set(i.data.tables.filter((t) => t.space_id === space.id).map((t) => t.id));
        const needs = seated
          .filter((a) => inSpace.has(a.tableId))
          .map((a) => ({ a, g: guests.get(a.guestId)! }))
          .filter(({ g }) => hasAnyDietary(g.dietaryNeeds, g.dietary))
          .map(({ a, g }) => ({ at: `${tableById.get(a.tableId)?.label ?? ""}${a.seatIndex === null ? "" : `.${a.seatIndex + 1}`}`, text: dietaryText(g.dietaryNeeds, g.dietary), name: guestName(g), allergy: hasAllergy(g.dietaryNeeds) }));
        return (
          <Page key={space.id} title={`${i.eventName} — floor plan: ${space.name}`}>
            <PlanDrawing space={space} tables={i.data.tables} fixtures={i.data.fixtures} customItems={i.data.customItems} marquees={i.data.marquees} backgroundUrl={i.backgrounds[space.id] ?? null} backgroundOpacity={space.background_opacity} options={{ venue: true, furniture: true, decor: false, chairs: "numbered", seats, tableText: "label_count", seatedAt }} />
            {legend.length > 0 ? (
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {counts.map((c) => (
                  <li key={c.label} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.colour }} />
                    {c.label}: {c.count}
                  </li>
                ))}
                <li className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full border-2 border-[#c81e1e]" />
                  Allergy
                </li>
              </ul>
            ) : (
              <p className="text-xs">
                <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full border-2 border-[#c81e1e] align-middle" /> Allergy
              </p>
            )}
            {needs.length > 0 ? (
              <div>
                <h3 className="mb-1 text-sm font-medium">Dietary needs by seat</h3>
                <ul className="columns-1 text-xs sm:columns-2">
                  {needs.map((d, k) => (
                    <li key={k} className={d.allergy ? "font-medium text-[#c81e1e]" : undefined}>
                      {d.at} {d.text}, {d.name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {n === 0 ? (
              <p className="text-sm">
                {pluralise(seated.length, "guest")} · {pluralise(i.data.tables.length, "table")} · {pluralise(highchairs, "highchair")}
              </p>
            ) : null}
          </Page>
        );
      })}

      <Page title={`${i.eventName} — kitchen summary`}>
        <KitchenSummaryView kitchen={kitchen} defaultStyle={SERVICE_LABEL[defaultStyle]} hasMenu={menu.length > 0} />
      </Page>

      <Page title={`${i.eventName} — guests A to Z`}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-1 pr-3 font-medium">Guest</th>
              <th className="py-1 pr-3 font-medium">Space</th>
              <th className="py-1 pr-3 font-medium">Table</th>
              <th className="py-1 font-medium">Seat</th>
            </tr>
          </thead>
          <tbody>
            {seated
              .map((a) => ({ g: guests.get(a.guestId)!, ...where(a.tableId, a.seatIndex) }))
              .sort((x, y) => compareBySurname(x.g, y.g))
              .map((r) => (
                <tr key={r.g.id} className="border-b border-line/60">
                  <td className="py-1 pr-3">{guestName(r.g)}</td>
                  <td className="py-1 pr-3">{r.space}</td>
                  <td className="py-1 pr-3">{r.table}</td>
                  <td className="py-1">{r.seat}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </Page>

      {i.data.tables.map((t, k) => {
        const style = t.style_id ? (i.data.styles.find((s) => s.id === t.style_id) ?? null) : null;
        const food = closeupFood({ kitchen, menu, defaultStyle, tableId: t.id, seats: i.data.assignments, guests: i.data.guests });
        const here = i.data.assignments.filter((a) => a.tableId === t.id && guests.has(a.guestId)).sort((a, b) => (a.seatIndex ?? 999) - (b.seatIndex ?? 999));
        const mealQ = mealQuestion(i.data.colour.questions, i.data.colour.answers, i.colourBy.kind === "question" ? i.colourBy.questionId : null);
        return (
          <Page key={t.id} title={`${tableName(t)}`} last={k === i.data.tables.length - 1}>
            <div className="max-w-md">
              <TableCloseup table={t} style={style} food={food} items={tableTopItems(t, i.data.styles)} dishNames={itemNamesOf(i)} />
            </div>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="py-1 pr-3 font-medium">Seat</th>
                  <th className="py-1 pr-3 font-medium">Guest</th>
                  <th className="py-1 pr-3 font-medium">{mealQ?.label ?? "Meal"}</th>
                  <th className="py-1 font-medium">Dietary</th>
                </tr>
              </thead>
              <tbody>
                {here.map((a) => {
                  const g = guests.get(a.guestId)!;
                  return (
                    <tr key={a.guestId} className="border-b border-line/60 align-top">
                      <td className="py-1 pr-3 tabular-nums">{a.seatIndex === null ? "·" : a.seatIndex + 1}</td>
                      <td className="py-1 pr-3">{guestName(g)}{g.ageBand !== "adult" ? <span className="text-muted"> ({g.ageBand})</span> : null}</td>
                      <td className="py-1 pr-3">{mealQ?.answers[g.id] ?? ""}</td>
                      <td className={`py-1 ${hasAllergy(g.dietaryNeeds) ? "font-medium text-[#c81e1e]" : ""}`}>{dietaryText(g.dietaryNeeds, g.dietary)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Page>
        );
      })}
    </div>
  );
}

/** The kitchen summary as plain lists, for print and the shared page. */
export function KitchenSummaryView({ kitchen, defaultStyle, hasMenu }: { kitchen: Kitchen; defaultStyle: string; hasMenu: boolean }) {
  if (!hasMenu) return <p className="text-sm text-muted">No menu has been entered yet. The event is served {defaultStyle.toLowerCase()}.</p>;
  return (
    <div className="space-y-4 text-sm">
      {kitchen.checkTables.length > 0 ? <p className="font-medium">Check platters: {kitchen.checkTables.join(", ")}</p> : null}
      {kitchen.courses.map((c) => (
        <div key={c.courseId}>
          <h3 className="font-medium">
            {c.name} <span className="font-normal text-muted">· {SERVICE_LABEL[c.style].toLowerCase()}</span>
          </h3>
          {c.style === "plated" ? (
            c.plated.length > 0 ? (
              <ul>
                {c.plated.map((p) => (
                  <li key={p.answer}>
                    {p.count} × {p.answer}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{pluralise(c.totalGuests, "guest")}</p>
            )
          ) : null}
          {c.style === "buffet" ? <p>{pluralise(c.totalGuests, "guest")}: {c.heads.filter((h) => h.guests > 0).map((h) => `${h.table} ${h.guests}`).join(" · ")}</p> : null}
          {c.style === "roaming" ? <p>{pluralise(c.totalGuests, "guest")}</p> : null}
          {c.style === "shared" ? (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="py-1 pr-3 font-medium">Table</th>
                  <th className="py-1 pr-3 font-medium">Sharing</th>
                  {c.shared.map((d) => (
                    <th key={d.dishId} className="py-1 pr-3 font-medium">
                      {d.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.heads
                  .filter((h) => h.guests > 0)
                  .map((h) => (
                    <tr key={h.tableId} className="border-b border-line/60">
                      <td className="py-1 pr-3">{h.table}</td>
                      <td className="py-1 pr-3 tabular-nums">{h.sharing}</td>
                      {c.shared.map((d) => (
                        <td key={d.dishId} className="py-1 pr-3 tabular-nums">
                          {d.needsServes ? "?" : (d.tables.find((x) => x.tableId === h.tableId)?.platters ?? "–")} {d.vessel}
                        </td>
                      ))}
                    </tr>
                  ))}
                <tr className="font-medium">
                  <td className="py-1 pr-3" colSpan={2}>
                    Total
                  </td>
                  {c.shared.map((d) => (
                    <td key={d.dishId} className="py-1 pr-3 tabular-nums">
                      {d.total ?? "?"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          ) : null}
          {c.ownPlates.length > 0 ? <p className="mt-1">Own plates: {c.ownPlates.map((l) => `${l.name} (${l.table}${l.seat ? `, seat ${l.seat}` : ""}${l.dietary ? `, ${l.dietary}` : ""})`).join("; ")}</p> : null}
          {c.kidsMeals.length > 0 ? <p className="mt-1">Kids&rsquo; meals: {c.kidsMeals.length} ({[...new Set(c.kidsMeals.map((k) => k.table))].join(", ")})</p> : null}
        </div>
      ))}
      <p>Serving utensils: {kitchen.utensils}</p>
      {kitchen.dietary.length > 0 ? (
        <div>
          <h3 className="font-medium">Dietary needs by seat</h3>
          <ul>
            {kitchen.dietary.map((d, k) => (
              <li key={k} className={d.allergy ? "font-medium text-[#c81e1e]" : undefined}>
                {d.table}
                {d.seat ? `.${d.seat}` : ""} {d.dietary}, {d.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Venue, florist, hire (E.2)
// ---------------------------------------------------------------------------
export function VenueExport(i: ExportInput) {
  const spaces = chosenSpaces(i);
  return (
    <div className="space-y-8">
      {spaces.map((space, n) => {
        const mine = i.data.tables.filter((t) => t.space_id === space.id && t.pos_x_cm !== null);
        return (
          <Page key={space.id} title={`${i.eventName} — for the venue: ${space.name}`} last={n === spaces.length - 1}>
            <PlanDrawing space={space} tables={i.data.tables} fixtures={i.data.fixtures} customItems={i.data.customItems} marquees={i.data.marquees} backgroundUrl={i.backgrounds[space.id] ?? null} backgroundOpacity={space.background_opacity} options={{ venue: true, furniture: true, decor: true, chairs: "none", tableText: "label_capacity" }} />
            <p className="text-xs">
              {mine.length === 0 ? "No tables here." : mine.map((t) => `${t.label}: ${t.capacity} chairs`).join(" · ")}
            </p>
          </Page>
        );
      })}
    </div>
  );
}

function centreText(t: SeatingTable, i: ExportInput): string {
  const style = t.style_id ? (i.data.styles.find((s) => s.id === t.style_id) ?? null) : null;
  const centre = effectiveStyle(style, parseStyleChanges(t.style_changes)).centre;
  const parts: string[] = [];
  for (const k of ["arrangement", "candles", "tablecloth", "runner"] as const) {
    const s = centre[k];
    if (s?.on) parts.push(`${CENTRE_LABEL[k]}${k === "candles" ? ` ×${s.count ?? 6}` : ""}${s.note ? ` (${s.note})` : ""}`);
  }
  for (const e of centre.extras ?? []) parts.push(`${e.name} ×${e.count}`);
  return parts.join(", ");
}

export function FloristExport(i: ExportInput) {
  const spaces = chosenSpaces(i);
  const { kitchen } = kitchenFor(i);
  const all = lines(i, kitchen.utensils).filter((l) => l.group === "centre" || l.group === "room");
  return (
    <div className="space-y-8">
      {spaces.map((space) => {
        const decor = i.data.fixtures.filter((f) => f.space_id === space.id && fixtureGroup(f.kind) === "decor");
        const customName = new Map(i.data.customItems.map((c) => [c.id, c.name]));
        const tables = i.data.tables.filter((t) => t.space_id === space.id && t.pos_x_cm !== null);
        return (
          <Page key={space.id} title={`${i.eventName} — for the florist: ${space.name}`}>
            <PlanDrawing space={space} tables={i.data.tables} fixtures={i.data.fixtures} customItems={i.data.customItems} marquees={i.data.marquees} backgroundUrl={i.backgrounds[space.id] ?? null} backgroundOpacity={space.background_opacity} options={{ venue: true, furniture: true, decor: true, chairs: "none", tableText: "label", numberDecor: true }} />
            <ol className="columns-1 text-sm sm:columns-2">
              {decor.map((f, k) => (
                <li key={f.id}>
                  {k + 1}. {f.label ?? (f.custom_item_id ? customName.get(f.custom_item_id) : null) ?? f.kind.replace(/_/g, " ")}
                  {f.quantity > 1 ? ` ×${f.quantity}` : ""}
                </li>
              ))}
            </ol>
            {tables.length > 0 ? (
              <ul className="text-sm">
                {tables.map((t) => (
                  <li key={t.id}>
                    {t.label} centre: {centreText(t, i) || "nothing set"}
                  </li>
                ))}
              </ul>
            ) : null}
            {/* Each decorated table's close-up, so the florist sees which way up the arrangements go (spec 59 Part E). */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {tables
                .filter((t) => tableTopItems(t, i.data.styles).length > 0)
                .map((t) => (
                  <div key={t.id} className="break-inside-avoid">
                    <h4 className="text-sm font-medium">{t.label}</h4>
                    <TableCloseup table={t} style={t.style_id ? (i.data.styles.find((st) => st.id === t.style_id) ?? null) : null} items={tableTopItems(t, i.data.styles)} dishNames={itemNamesOf(i)} />
                  </div>
                ))}
            </div>
          </Page>
        );
      })}
      <Page title={`${i.eventName} — florist's list`} last>
        <ItemList lines={all} />
      </Page>
    </div>
  );
}

function ItemList({ lines: rows }: { lines: ItemLine[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted">Nothing to list yet.</p>;
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-line text-left">
          <th className="py-1 pr-3 font-medium">Item</th>
          <th className="py-1 pr-3 text-right font-medium">Suggested</th>
          <th className="py-1 text-right font-medium">Final</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((l) => (
          <tr key={l.key} className="border-b border-line/60">
            <td className="py-1 pr-3">
              {l.label}
              {l.notes.length > 0 ? <span className="text-xs text-muted"> — {l.notes.join(", ")}</span> : null}
            </td>
            <td className="py-1 pr-3 text-right tabular-nums">{l.suggestedChairs}</td>
            <td className="py-1 text-right tabular-nums">{l.final === null ? "Not set" : l.final}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function HireExport(i: ExportInput) {
  const spaces = chosenSpaces(i);
  const { kitchen } = kitchenFor(i);
  const place = lines(i, kitchen.utensils).filter((l) => l.group === "place" || l.group === "utensil");
  // Furniture counts by type and size.
  const furniture = new Map<string, number>();
  for (const t of i.data.tables) {
    const { length, width } = tableSize(t);
    const key = `${SHAPE_WORD[t.shape] ?? t.shape} · ${Math.round(length)}${length === width ? "" : ` × ${Math.round(width)}`} cm · ${t.capacity} seats`;
    furniture.set(key, (furniture.get(key) ?? 0) + 1);
  }
  for (const f of i.data.fixtures.filter((x) => fixtureGroup(x.kind) !== "decor")) {
    const key = `${f.label ?? f.kind.replace(/_/g, " ")} · ${f.width_cm} × ${f.depth_cm} cm`;
    furniture.set(key, (furniture.get(key) ?? 0) + 1);
  }
  const chairs = i.data.tables.reduce((n, t) => n + t.capacity, 0);
  return (
    <div className="space-y-8">
      {spaces.map((space) => {
        const mine = i.data.fixtures.filter((f) => f.space_id === space.id && fixtureGroup(f.kind) !== "decor");
        return (
          <Page key={space.id} title={`${i.eventName} — for the hire company: ${space.name}`}>
            <PlanDrawing space={space} tables={i.data.tables} fixtures={i.data.fixtures} customItems={i.data.customItems} marquees={i.data.marquees} backgroundUrl={i.backgrounds[space.id] ?? null} backgroundOpacity={space.background_opacity} options={{ venue: true, furniture: true, decor: false, chairs: "none", tableText: "label", markFurniture: true }} />
            {mine.length > 0 ? (
              <ol className="columns-1 text-sm sm:columns-2">
                {mine.map((f, k) => (
                  <li key={f.id}>
                    {"ABCDEFGHIJKLMNOPQRSTUVWXYZ"[k % 26]}. {f.label ?? f.kind.replace(/_/g, " ")} · {f.width_cm} × {f.depth_cm} cm
                  </li>
                ))}
              </ol>
            ) : null}
            {/* Each styled table's close-up, with what sits on it. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {i.data.tables
                .filter((t) => t.space_id === space.id && t.pos_x_cm !== null && (t.style_id || tableTopItems(t, i.data.styles).length > 0))
                .map((t) => (
                  <div key={t.id} className="break-inside-avoid">
                    <h4 className="text-sm font-medium">{t.label}</h4>
                    <TableCloseup table={t} style={t.style_id ? (i.data.styles.find((st) => st.id === t.style_id) ?? null) : null} items={tableTopItems(t, i.data.styles)} dishNames={itemNamesOf(i)} />
                  </div>
                ))}
            </div>
          </Page>
        );
      })}
      <Page title={`${i.eventName} — furniture and tableware`} last>
        <h3 className="text-sm font-medium">Furniture</h3>
        <ul className="text-sm">
          {[...furniture.entries()].map(([k, n]) => (
            <li key={k}>
              {n} × {k}
            </li>
          ))}
          <li className="font-medium">{pluralise(chairs, "chair")} in all</li>
        </ul>
        <h3 className="mt-3 text-sm font-medium">Tableware</h3>
        <ItemList lines={place} />
      </Page>
    </div>
  );
}

