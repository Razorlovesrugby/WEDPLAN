"use client";

import { useMemo, useState, useTransition } from "react";
import { saveSeatingMenu, setPlatterCount, setServiceStyle } from "@/server/actions/seating-service";
import { buildKitchen, mealQuestion, sharedFlags } from "@/lib/seating/kitchen";
import { effectiveStyle, parseStyleChanges } from "@/lib/seating/items";
import { MENU_LIMITS, SERVICE_LABEL, SERVICE_STYLES, VESSELS, isServiceStyle, parseMenu, type Course, type Dish, type Menu, type ServiceStyle } from "@/lib/seating/service";
import { pluralise } from "@/lib/format";
import { newDrawingId } from "@/lib/seating/drawing";
import { useSeating } from "./seating-state";

/**
 * How food is served (spec 57 Part F): the plan's default style, the menu
 * with each course's own style, and the kitchen summary that follows from who
 * sits where. Changing a style never touches RSVP questions, answers or dishes.
 */
export function FoodPanel() {
  const { eventId, data, tables, assignments, settings, colourBy, setError, refresh } = useSeating();
  const [pending, startTransition] = useTransition();
  const plan = data.plan;
  const defaultStyle: ServiceStyle = isServiceStyle(plan?.service_style) ? plan.service_style : "plated";
  const stored = useMemo(() => {
    const r = parseMenu(plan?.menu);
    return r.ok ? r.menu : [];
  }, [plan?.menu]);
  const [menu, setMenu] = useState<Menu>(stored);
  const [dirty, setDirty] = useState(false);
  const edit = (next: Menu) => {
    setMenu(next);
    setDirty(true);
  };
  const ids = () => new Set(menu.flatMap((c) => [c.id, ...c.dishes.map((d) => d.id)]));

  const meal = mealQuestion(data.colour.questions, data.colour.answers, colourBy.kind === "question" ? colourBy.questionId : null);
  const styleById = new Map(data.styles.map((s) => [s.id, s]));
  const kitchen = useMemo(
    () =>
      buildKitchen({
        menu: dirty ? stored : menu,
        defaultStyle,
        tables,
        seats: assignments,
        guests: data.guests,
        settings,
        meal,
      }),
    [dirty, stored, menu, defaultStyle, tables, assignments, data.guests, settings, meal],
  );
  const hasShared = kitchen.courses.some((c) => c.style === "shared");

  const run = (job: () => Promise<{ ok: boolean; error?: string }>, then?: () => void) =>
    startTransition(async () => {
      const r = await job();
      if (!r.ok) setError(r.error ?? "That didn't work");
      else then?.();
      refresh();
    });

  const setCourse = (id: string, patch: Partial<Course>) => edit(menu.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const setDish = (courseId: string, dishId: string, patch: Partial<Dish>) =>
    edit(menu.map((c) => (c.id === courseId ? { ...c, dishes: c.dishes.map((d) => (d.id === dishId ? { ...d, ...patch } : d)) } : c)));

  return (
    <details className="card p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Food service <span className="font-normal text-muted">({SERVICE_LABEL[defaultStyle].toLowerCase()}{menu.length ? `, ${pluralise(menu.length, "course")}` : ""})</span>
      </summary>

      <div className="mt-3 space-y-5">
        <section>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">How this event is served</h3>
          <div role="radiogroup" aria-label="Default service style" className="flex flex-wrap gap-1.5">
            {SERVICE_STYLES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={defaultStyle === s}
                disabled={pending}
                className={`btn py-1 ${defaultStyle === s ? "ring-2 ring-ink" : ""}`}
                onClick={() => run(() => setServiceStyle(eventId, s))}
              >
                {SERVICE_LABEL[s]}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">
            Courses take this unless they say otherwise, so “canapés roaming, mains shared, dessert plated” is one event. The RSVP&rsquo;s meal question is yours to keep or remove: nothing here changes it.
          </p>
        </section>

        <section aria-label="The menu">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">The menu</h3>
          {menu.length === 0 ? <p className="text-muted">No courses yet.</p> : null}
          <ul className="space-y-3">
            {menu.map((course) => {
              const style = course.style ?? defaultStyle;
              return (
                <li key={course.id} className="rounded border border-line p-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="min-w-[10rem] flex-1">
                      <span className="mb-1 block text-xs text-muted">Course</span>
                      <input className="field w-full" value={course.name} maxLength={MENU_LIMITS.name} onChange={(e) => setCourse(course.id, { name: e.target.value })} />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs text-muted">Served</span>
                      <select className="field" value={course.style ?? ""} onChange={(e) => setCourse(course.id, { style: e.target.value === "" ? null : (e.target.value as ServiceStyle) })}>
                        <option value="">Like the event ({SERVICE_LABEL[defaultStyle].split(" ")[0]})</option>
                        {SERVICE_STYLES.map((s) => (
                          <option key={s} value={s}>
                            {SERVICE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="button" className="btn py-1 text-red-700" onClick={() => edit(menu.filter((c) => c.id !== course.id))}>
                      Remove course
                    </button>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {course.dishes.map((dish) => (
                      <li key={dish.id} className="flex flex-wrap items-end gap-2">
                        <label className="min-w-[9rem] flex-1">
                          <span className="sr-only">Dish</span>
                          <input className="field w-full py-1" placeholder="Dish" value={dish.name} maxLength={MENU_LIMITS.name} onChange={(e) => setDish(course.id, dish.id, { name: e.target.value })} />
                        </label>
                        <select className="field py-1" aria-label="Served on" value={dish.vessel} onChange={(e) => setDish(course.id, dish.id, { vessel: e.target.value as Dish["vessel"] })}>
                          {VESSELS.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                        {style === "shared" ? (
                          <label className="flex items-center gap-1">
                            <span className="text-xs text-muted">serves</span>
                            <input
                              className="field w-16 py-1"
                              inputMode="numeric"
                              aria-label={`How many people one ${dish.vessel} of ${dish.name || "this dish"} feeds`}
                              value={dish.serves ?? ""}
                              onChange={(e) => setDish(course.id, dish.id, { serves: e.target.value === "" ? null : Math.round(Number(e.target.value)) || null })}
                            />
                          </label>
                        ) : null}
                        <input
                          className="field w-40 py-1"
                          aria-label="Dietary tags, for display"
                          placeholder="Tags: vegan, gluten_free"
                          value={dish.tags.join(", ")}
                          onChange={(e) => setDish(course.id, dish.id, { tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                        />
                        <button type="button" className="text-xs text-red-700 underline" onClick={() => setCourse(course.id, { dishes: course.dishes.filter((d) => d.id !== dish.id) })}>
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="mt-1.5 text-xs underline"
                    onClick={() => setCourse(course.id, { dishes: [...course.dishes, { id: newDrawingId("d", ids()), name: "", tags: [], vessel: "platter", serves: null }] })}
                  >
                    + Add a dish
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className="btn py-1" onClick={() => edit([...menu, { id: newDrawingId("c", ids()), name: "", style: null, dishes: [] }])} disabled={menu.length >= MENU_LIMITS.courses}>
              + Add a course
            </button>
            <button
              type="button"
              className="btn-primary py-1"
              disabled={pending || !dirty}
              onClick={() => run(() => saveSeatingMenu(eventId, menu), () => setDirty(false))}
            >
              Save the menu
            </button>
            {dirty ? <span className="text-xs text-muted">Not saved yet.</span> : null}
          </div>
          <p className="mt-1 text-xs text-muted">Up to {MENU_LIMITS.courses} courses and {MENU_LIMITS.dishes} dishes. “Serves” is how many one dish feeds, from the caterer; platters can&rsquo;t be counted until it is set.</p>
        </section>

        {kitchen.courses.length > 0 ? (
          <section aria-label="Kitchen summary" className="space-y-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Kitchen summary</h3>
            {kitchen.checkTables.length > 0 ? (
              <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-amber-900">Check platters: {kitchen.checkTables.join(", ")} — who shares changed since the count was typed.</p>
            ) : null}
            {kitchen.courses.map((c) => (
              <div key={c.courseId} className="space-y-1.5">
                <h4 className="font-medium">
                  {c.name} <span className="font-normal text-muted">· {SERVICE_LABEL[c.style].toLowerCase()}</span>
                </h4>
                {c.style === "plated" ? (
                  c.plated.length > 0 ? (
                    <ul className="text-xs">
                      {c.plated.map((p) => (
                        <li key={p.answer}>
                          {p.count} × {p.answer}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted">{meal ? "Nobody seated yet." : "No meal question on the RSVP, so a count by answer isn't possible."} {pluralise(c.totalGuests, "guest")} seated.</p>
                  )
                ) : null}
                {c.style === "buffet" || c.style === "roaming" ? <p className="text-xs">{pluralise(c.totalGuests, "guest")}{c.style === "buffet" ? `, ${c.heads.filter((h) => h.guests > 0).map((h) => `${h.table} ${h.guests}`).join(" · ")}` : ""}</p> : null}
                {c.style === "shared" ? (
                  <SharedTable
                    course={c}
                    onType={(tableId, dishId, n, sharing) => run(() => setPlatterCount(eventId, tableId, dishId, n, sharing))}
                    pending={pending}
                  />
                ) : null}
                {(c.style === "shared" || c.style === "buffet" || c.style === "roaming") && (c.ownPlates.length > 0 || c.kidsMeals.length > 0) ? (
                  <p className="text-xs text-muted">
                    {c.ownPlates.length > 0 ? `Own plates: ${c.ownPlates.map((l) => `${l.name} (${l.table}${l.seat ? `, seat ${l.seat}` : ""})`).join("; ")}. ` : ""}
                    {c.kidsMeals.length > 0 ? `Kids' meals: ${c.kidsMeals.length} (${c.kidsMeals.map((l) => `${l.table}`).filter((t, i, all) => all.indexOf(t) === i).join(", ")}).` : ""}
                  </p>
                ) : null}
              </div>
            ))}
            {hasShared ? (
              <p className="text-xs">
                Serving utensils: <strong>{kitchen.utensils}</strong> (two per platter).
              </p>
            ) : null}
            {tables.some((t) => hasShared && sharedFlags(t, effectiveStyle(t.style_id ? (styleById.get(t.style_id) ?? null) : null, parseStyleChanges(t.style_changes)).centre, settings).length > 0) ? (
              <ul className="list-disc pl-5 text-xs text-amber-900">
                {tables.flatMap((t) =>
                  sharedFlags(t, effectiveStyle(t.style_id ? (styleById.get(t.style_id) ?? null) : null, parseStyleChanges(t.style_changes)).centre, settings).map((f) => (
                    <li key={`${t.id}${f}`}>
                      {t.label}: {f}
                    </li>
                  )),
                )}
              </ul>
            ) : null}
            {kitchen.dietary.length > 0 ? (
              <div>
                <h4 className="mb-1 font-medium">Dietary needs by seat</h4>
                <ul className="text-xs">
                  {kitchen.dietary.map((d, i) => (
                    <li key={i} className={d.allergy ? "text-red-800" : undefined}>
                      {d.table}
                      {d.seat ? `, seat ${d.seat}` : ""}: {d.name} — {d.dietary}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </details>
  );
}

/** Platters per dish for each table, with the formula's answer and a box to type your own. */
function SharedTable({
  course,
  onType,
  pending,
}: {
  course: ReturnType<typeof buildKitchen>["courses"][number];
  onType: (tableId: string, dishId: string, n: number | null, sharing: number) => void;
  pending: boolean;
}) {
  if (course.shared.length === 0) return <p className="text-xs text-muted">Add dishes to this course to count platters.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-1 pr-2 font-normal">Table</th>
            <th className="py-1 pr-2 font-normal">Sharing</th>
            {course.shared.map((d) => (
              <th key={d.dishId} className="py-1 pr-2 font-normal">
                {d.name || "Dish"} <span className="text-muted">(serves {d.serves ?? "?"})</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {course.heads
            .filter((h) => h.guests > 0)
            .map((h) => (
              <tr key={h.tableId} className="border-t border-line">
                <td className="py-1 pr-2">{h.table}</td>
                <td className="py-1 pr-2 tabular-nums">{h.sharing}</td>
                {course.shared.map((d) => {
                  const t = d.tables.find((x) => x.tableId === h.tableId);
                  return (
                    <td key={d.dishId} className="py-1 pr-2">
                      {d.needsServes ? (
                        <span className="text-amber-800">Set “serves”</span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <input
                            className="field w-14 py-0.5"
                            inputMode="numeric"
                            aria-label={`${d.name} platters for ${h.table}`}
                            defaultValue={t?.typed ?? ""}
                            key={`${t?.typed}-${t?.computed}`}
                            placeholder={t?.computed === null || t?.computed === undefined ? "–" : String(t.computed)}
                            disabled={pending}
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              const n = raw === "" ? null : Math.max(0, Math.round(Number(raw)));
                              if (n !== null && !Number.isFinite(n)) return;
                              if (n !== (t?.typed ?? null)) onType(h.tableId, d.dishId, n, h.sharing);
                            }}
                          />
                          {t?.stale ? <span className="text-amber-800">Check platters</span> : null}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          <tr className="border-t border-line font-medium">
            <td className="py-1 pr-2" colSpan={2}>
              Total
            </td>
            {course.shared.map((d) => (
              <td key={d.dishId} className="py-1 pr-2 tabular-nums">
                {d.total ?? "–"}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
