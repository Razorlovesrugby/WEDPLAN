import Link from "next/link";
import { AUDIT_AREAS, actorLabel, describeEntry, parseAuditFilters } from "@/lib/audit/describe";
import { formatDate } from "@/lib/format";
import { listAuditEntries } from "@/server/queries/audit";
import { getCollaborators, requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Activity" };

/**
 * `/settings/activity` — who changed what (spec 32 §4.3).
 *
 * Read-only. Filters live in the URL, as `/guests` and `/vendors` keep theirs,
 * so a filtered view is a link you can send. It is a plain GET form: nothing
 * here needs client JavaScript.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const filters = parseAuditFilters(await searchParams);
  const wedding = await requireWedding();
  const [page, collaborators] = await Promise.all([
    listAuditEntries(
      wedding.id,
      wedding.timezone,
      filters.area,
      filters.actor,
      filters.from,
      filters.to,
      filters.before,
    ),
    getCollaborators(wedding.id),
  ]);

  const dayOf = (at: string) =>
    formatDate(at, wedding.timezone, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeOf = (at: string) => formatDate(at, wedding.timezone, { hour: "2-digit", minute: "2-digit" });

  const days: { day: string; rows: typeof page.entries }[] = [];
  for (const entry of page.entries) {
    const day = dayOf(entry.at);
    const last = days[days.length - 1];
    if (last && last.day === day) last.rows.push(entry);
    else days.push({ day, rows: [entry] });
  }

  const filtered = Boolean(filters.area || filters.actor || filters.from || filters.to);
  const olderParams = new URLSearchParams();
  if (filters.area) olderParams.set("area", filters.area);
  if (filters.actor) olderParams.set("actor", filters.actor);
  if (filters.from) olderParams.set("from", filters.from);
  if (filters.to) olderParams.set("to", filters.to);
  if (page.nextBefore) olderParams.set("before", String(page.nextBefore));

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted">
          <Link className="underline hover:text-accent" href="/settings">
            Settings
          </Link>
        </p>
        <h1 className="font-serif text-2xl">Activity</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Every change to your wedding&rsquo;s details, who made it and when. Changes made by a
          guest through their own link, or automatically, are included. Bank details and links are
          recorded as changed but never shown. Kept for a year.
        </p>
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        <label className="space-y-1 text-sm">
          <span className="block text-muted">Area</span>
          <select name="area" className="field w-auto" defaultValue={filters.area ?? ""}>
            <option value="">Everything</option>
            {AUDIT_AREAS.map((area) => (
              <option key={area.key} value={area.key}>
                {area.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted">Who</span>
          <select name="actor" className="field w-auto" defaultValue={filters.actor ?? ""}>
            <option value="">Anyone</option>
            {collaborators.map((c) => (
              <option key={c.user_id} value={c.user_id}>
                {actorLabel({ actor_id: c.user_id, actor_kind: "planner", table_name: "" }, collaborators)}
              </option>
            ))}
            <option value="public">Guests &amp; automatic</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted">From</span>
          <input type="date" name="from" className="field w-auto" defaultValue={filters.from ?? ""} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted">To</span>
          <input type="date" name="to" className="field w-auto" defaultValue={filters.to ?? ""} />
        </label>
        <button type="submit" className="btn-primary">
          Filter
        </button>
        {filtered ? (
          <Link href="/settings/activity" className="btn">
            Clear
          </Link>
        ) : null}
      </form>

      {days.length === 0 ? (
        <p className="card p-4 text-sm text-muted">
          {filtered ? "Nothing matches those filters." : "Nothing has been recorded yet."}
        </p>
      ) : (
        days.map(({ day, rows }) => (
          <section key={day} aria-label={day} className="space-y-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">{day}</h2>
            <ul className="card divide-y divide-line">
              {rows.map((entry) => {
                const d = describeEntry(entry, collaborators, wedding.timezone);
                return (
                  <li key={entry.id} className="space-y-1 p-3 text-sm">
                    <p>
                      <span className="font-medium">{d.who}</span> {d.verb} {d.subject}
                      <span className="ml-2 text-xs text-muted">{timeOf(entry.at)}</span>
                    </p>
                    {d.details.length > 0 ? (
                      <ul className="space-y-0.5 text-xs text-muted">
                        {d.details.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {page.nextBefore ? (
        <p>
          <Link className="btn" href={`/settings/activity?${olderParams.toString()}`}>
            Older changes
          </Link>
        </p>
      ) : null}
    </div>
  );
}
