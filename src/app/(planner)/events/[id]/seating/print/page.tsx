import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { body, script } from "@/lib/fonts";
import { pluralise } from "@/lib/format";
import { colourCounts, colourLegend, guestColour, parseColourBy, serialiseColourBy } from "@/lib/seating/colour";
import { FIXTURE_DEFAULTS, seatPositions, tableSize } from "@/lib/seating/geometry";
import { chairsNeeded, nameIndex, placeCardOrder, tableListings } from "@/lib/seating/listings";
import { guestName, guestNameSurnameFirst } from "@/lib/seating/model";
import { resolveTheme, themeCssVars } from "@/lib/theme/presets";
import { PrintButton } from "@/components/seating/print-button";
import { getSeatingPlan } from "@/server/queries/seating";
import { getEvents, requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Print seating" };

const VIEWS = [
  ["tables", "By table"],
  ["names", "By name"],
  ["catering", "Numbers"],
  ["floor", "Floor plan"],
  ["escort", "Escort cards"],
  ["cards", "Place cards"],
] as const;
type View = (typeof VIEWS)[number][0];

/**
 * The seating print pack (spec 33 §G). HTML and `@media print`, like the
 * contact sheet and the invitation sheets: the browser makes the PDF, and the
 * page works offline at a print shop once loaded.
 */
export default async function SeatingPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; colour?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const view: View = (VIEWS.map((v) => v[0]) as string[]).includes(sp.view ?? "") ? (sp.view as View) : "tables";
  const wedding = await requireWedding();
  const event = (await getEvents(wedding.id)).find((e) => e.id === id);
  if (!event) notFound();

  const data = await getSeatingPlan(wedding.id, id);
  const colourBy = parseColourBy(sp.colour);
  const legend = colourLegend(colourBy, data.colour);
  const listings = tableListings(data);
  const colourParam = serialiseColourBy(colourBy);
  const href = (v: string) => `/events/${id}/seating/print?view=${v}${colourParam ? `&colour=${encodeURIComponent(colourParam)}` : ""}`;

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Link href={`/events/${id}/seating${colourParam ? `?colour=${encodeURIComponent(colourParam)}` : ""}`} className="btn">
          ← Back to seating
        </Link>
        <nav aria-label="Print views" className="flex flex-wrap gap-1">
          {VIEWS.map(([v, label]) => (
            <Link
              key={v}
              href={href(v)}
              aria-current={v === view ? "page" : undefined}
              className={`rounded px-3 py-1.5 text-sm ${v === view ? "bg-ink text-white" : "text-muted hover:bg-line/50"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto">
          <PrintButton />
        </span>
      </div>

      {data.tables.length === 0 ? (
        <p className="card p-8 text-center text-sm text-muted">No tables yet, so there&rsquo;s nothing to print.</p>
      ) : view === "tables" ? (
        <div>
          <PrintTitle title={`${event.name} — seating by table`} />
          {legend.length > 0 ? <Legend entries={legend} /> : null}
          <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
            {listings.map((l) => (
              <section key={l.table.id} className="print-card rounded border border-line p-3" style={{ breakInside: "avoid" }}>
                <h2 className="flex items-baseline justify-between font-medium">
                  {l.table.label}
                  <span className="text-xs font-normal text-muted">
                    {chairsNeeded(l)} / {l.table.capacity} chairs
                    {l.infants > 0 ? ` · ${pluralise(l.infants, "high chair")}` : ""}
                  </span>
                </h2>
                <ol className="mt-2 space-y-0.5 text-sm">
                  {l.guests.map((s) => {
                    const c = guestColour(s.guest, colourBy, data.colour);
                    return (
                      <li key={s.guest.id} className="flex gap-2">
                        <span className="w-6 shrink-0 text-right text-muted tabular-nums">
                          {s.seatIndex === null ? "·" : s.seatIndex + 1}
                        </span>
                        {c ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.colour }} /> : null}
                        <span className="flex-1">
                          {guestName(s.guest)}
                          {s.guest.ageBand !== "adult" ? <span className="text-muted"> ({s.guest.ageBand})</span> : null}
                          {s.guest.dietary ? <span className="block text-xs text-muted">Dietary: {s.guest.dietary}</span> : null}
                          {s.guest.accessibility ? (
                            <span className="block text-xs text-muted">Access: {s.guest.accessibility}</span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                  {l.table.reserved_seats > 0 ? (
                    <li className="text-muted">
                      + {l.table.reserved_seats} reserved{l.table.reserved_note ? ` — ${l.table.reserved_note}` : ""}
                    </li>
                  ) : null}
                </ol>
                {l.table.notes ? <p className="mt-2 text-xs text-muted">{l.table.notes}</p> : null}
              </section>
            ))}
          </div>
        </div>
      ) : view === "names" ? (
        <EntranceBoard weddingId={wedding.id} eventName={event.name} entries={nameIndex(data)} />
      ) : view === "catering" ? (
        <div>
          <PrintTitle title={`${event.name} — numbers for the caterer`} />
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-2 pr-3 font-medium">Table</th>
                <th className="py-2 pr-3 text-right font-medium">Adults</th>
                <th className="py-2 pr-3 text-right font-medium">Children</th>
                <th className="py-2 pr-3 text-right font-medium">Infants</th>
                <th className="py-2 pr-3 text-right font-medium">Reserved</th>
                {legend.length > 0 ? <th className="py-2 pr-3 font-medium">{colourHeading(colourBy, data.colour)}</th> : null}
                <th className="py-2 font-medium">Dietary</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.table.id} className="border-b border-line align-top">
                  <td className="py-2 pr-3 font-medium">{l.table.label}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.adults}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.children}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.infants}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.table.reserved_seats}</td>
                  {legend.length > 0 ? (
                    <td className="py-2 pr-3">
                      {colourCounts(
                        l.guests.map((s) => s.guest),
                        colourBy,
                        data.colour,
                      )
                        .map((c) => `${c.count} ${c.label}`)
                        .join(", ")}
                    </td>
                  ) : null}
                  <td className="py-2">
                    {l.guests
                      .filter((s) => s.guest.dietary)
                      .map((s) => `${guestName(s.guest)}: ${s.guest.dietary}`)
                      .join("; ") || "—"}
                  </td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-2 pr-3">Total</td>
                <td className="py-2 pr-3 text-right tabular-nums">{sum(listings.map((l) => l.adults))}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{sum(listings.map((l) => l.children))}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{sum(listings.map((l) => l.infants))}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{sum(listings.map((l) => l.table.reserved_seats))}</td>
                {legend.length > 0 ? (
                  <td className="py-2 pr-3">
                    {colourCounts(
                      listings.flatMap((l) => l.guests.map((s) => s.guest)),
                      colourBy,
                      data.colour,
                    )
                      .map((c) => `${c.count} ${c.label}`)
                      .join(", ")}
                  </td>
                ) : null}
                <td />
              </tr>
            </tbody>
          </table>
          {legend.length === 0 && data.colour.questions.length > 0 ? (
            <p className="no-print mt-3 text-sm text-muted">
              Choose &ldquo;Colour by&rdquo; an answer (a meal choice, say) on the seating screen to add counts per answer here.
            </p>
          ) : null}
        </div>
      ) : view === "floor" ? (
        <div>
          <PrintTitle title={`${event.name} — floor plan`} />
          <FloorPlan data={data} />
          <style>{`@media print { @page { size: landscape; } }`}</style>
        </div>
      ) : view === "escort" ? (
        <div>
          <PrintTitle title={`${event.name} — escort cards`} className="no-print" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
            {nameIndex(data).map((e) => {
              const c = guestColour(e.guest, colourBy, data.colour);
              return (
                <div
                  key={e.guest.id}
                  className="print-card flex flex-col items-center justify-center rounded border border-line px-3 py-5 text-center"
                  style={{ breakInside: "avoid" }}
                >
                  <p className="font-serif text-lg leading-tight">{guestName(e.guest)}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                    {c ? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.colour }} /> : null}
                    {e.table.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div>
          <PrintTitle title={`${event.name} — place cards`} className="no-print" />
          <p className="no-print mb-3 text-sm text-muted">
            Four to a page, in table and chair order. Fold along the dashed line.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
            {placeCardOrder(data).map((e) => {
              const c = guestColour(e.guest, colourBy, data.colour);
              return (
                <div
                  key={e.guest.id}
                  className="print-card grid h-[125mm] grid-rows-2 rounded border border-line text-center"
                  style={{ breakInside: "avoid" }}
                >
                  <div className="border-b border-dashed border-line" aria-hidden />
                  <div className="flex flex-col items-center justify-center px-4">
                    <p className="font-serif text-3xl leading-tight">{guestName(e.guest)}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
                      {c ? <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.colour }} /> : null}
                      {e.table.label}
                      {e.seatIndex !== null ? ` · seat ${e.seatIndex + 1}` : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function sum(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0);
}

function colourHeading(
  c: ReturnType<typeof parseColourBy>,
  ctx: { questions: { id: string; label: string }[]; tags: { id: string; name: string }[] },
) {
  if (c.kind === "question") return ctx.questions.find((q) => q.id === c.questionId)?.label ?? "Answer";
  if (c.kind === "tag") return ctx.tags.find((t) => t.id === c.tagId)?.name ?? "Tag";
  return "Side";
}

function PrintTitle({ title, className = "" }: { title: string; className?: string }) {
  return <h1 className={`mb-4 font-serif text-2xl ${className}`}>{title}</h1>;
}

function Legend({ entries }: { entries: { label: string; colour: string }[] }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {entries.map((e) => (
        <li key={e.label} className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.colour }} />
          {e.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * The entrance board, in the site's own colours and faces (spec 31's tokens),
 * at poster size — so it can go straight to a print shop as a PDF.
 */
async function EntranceBoard({
  weddingId,
  eventName,
  entries,
}: {
  weddingId: string;
  eventName: string;
  entries: ReturnType<typeof nameIndex>;
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("site_content")
    .select("payload")
    .eq("wedding_id", weddingId)
    .eq("block_key", "theme")
    .maybeSingle();
  const theme = resolveTheme(data?.payload ?? null);

  return (
    <div
      style={themeCssVars(theme)}
      className={`${script.variable} ${body.variable} rounded border border-line bg-paper p-8 font-body text-ink print:border-0 print:p-0`}
    >
      <h1 className="mb-1 text-center font-script text-5xl">Find your seat</h1>
      <p className="mb-6 text-center text-xs uppercase tracking-[0.18em] text-muted">{eventName}</p>
      <ol className="columns-1 gap-8 text-base sm:columns-2 lg:columns-3 print:columns-3">
        {entries.map((e) => (
          <li key={e.guest.id} className="flex break-inside-avoid justify-between gap-3 border-b border-line/60 py-1">
            <span>{guestNameSurnameFirst(e.guest)}</span>
            <span className="text-muted">{e.table.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The Room view as a static drawing: tables with label and count, fixtures, no names. */
function FloorPlan({ data }: { data: Awaited<ReturnType<typeof getSeatingPlan>> }) {
  const w = data.plan?.room_width_cm ?? 2000;
  const d = data.plan?.room_depth_cm ?? 1500;
  const listings = new Map(tableListings(data).map((l) => [l.table.id, l]));
  const placed = data.tables.filter((t) => t.pos_x_cm !== null);
  const unplaced = data.tables.filter((t) => t.pos_x_cm === null);
  const font = Math.max(18, w / 70);

  return (
    <div>
      <svg viewBox={`-50 -50 ${w + 100} ${d + 100}`} className="w-full border border-line bg-white" role="img" aria-label="Floor plan">
        <rect x={0} y={0} width={w} height={d} fill="#fff" stroke="#555" strokeWidth={4} />
        {data.fixtures.map((f) => (
          <g key={f.id} transform={`translate(${f.pos_x_cm} ${f.pos_y_cm}) rotate(${f.rotation_deg})`}>
            <rect x={-f.width_cm / 2} y={-f.depth_cm / 2} width={f.width_cm} height={f.depth_cm} fill="#eee" stroke="#888" strokeWidth={3} />
            <text transform={`rotate(${-f.rotation_deg})`} textAnchor="middle" dominantBaseline="central" fontSize={font * 0.85} fill="#555">
              {f.label ?? FIXTURE_DEFAULTS[f.kind]?.label ?? f.kind}
            </text>
          </g>
        ))}
        {placed.map((t) => {
          const { length, width } = tableSize(t);
          const seats = seatPositions({ ...t, pos_x_cm: 0, pos_y_cm: 0, rotation_deg: 0 }) ?? [];
          const l = listings.get(t.id)!;
          return (
            <g key={t.id} transform={`translate(${t.pos_x_cm} ${t.pos_y_cm}) rotate(${t.rotation_deg})`}>
              {seats.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={18} fill="#fff" stroke="#888" strokeWidth={2} />
              ))}
              {t.shape === "round" ? (
                <circle r={length / 2} fill="#f6f6f6" stroke="#333" strokeWidth={4} />
              ) : (
                <rect x={-length / 2} y={-width / 2} width={length} height={width} fill="#f6f6f6" stroke="#333" strokeWidth={4} />
              )}
              <g transform={`rotate(${-t.rotation_deg})`}>
                <text textAnchor="middle" y={-font * 0.1} fontSize={font} fill="#111">
                  {t.label}
                </text>
                <text textAnchor="middle" y={font} fontSize={font * 0.75} fill="#555">
                  {chairsNeeded(l)}/{t.capacity}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-xs text-muted">
        {(w / 100).toLocaleString("en-NZ")} × {(d / 100).toLocaleString("en-NZ")} m
        {data.plan?.calibrated ? ", measured against the venue's plan" : ""}.
        {unplaced.length > 0 ? ` Not placed in the room: ${unplaced.map((t) => t.label).join(", ")}.` : ""}
      </p>
    </div>
  );
}
