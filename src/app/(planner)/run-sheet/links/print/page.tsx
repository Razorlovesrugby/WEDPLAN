import { qrDataUri } from "@/lib/qr";
import { decryptToken } from "@/lib/tokens";
import { absoluteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getDayLinksOverview } from "@/server/queries/day-links";
import { requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Day links — print" };

/** One card per person: their name, their jobs and a QR code for their link (spec 54 §10.5). */
export default async function DayLinksPrintPage() {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const [overview, links, assignees, items] = await Promise.all([
    getDayLinksOverview(wedding.id),
    supabase.from("day_links").select("id, token_encrypted").eq("wedding_id", wedding.id).is("revoked_at", null),
    supabase.from("run_sheet_item_assignees").select("item_id, vendor_id, guest_id, person_id").eq("wedding_id", wedding.id),
    supabase.from("run_sheet_items").select("id, title, starts_at").eq("wedding_id", wedding.id),
  ]);
  if (links.error) throw new Error(links.error.message);
  if (assignees.error) throw new Error(assignees.error.message);
  if (items.error) throw new Error(items.error.message);

  const itemById = new Map((items.data ?? []).map((i) => [i.id, i]));
  const tokenOf = new Map((links.data ?? []).map((l) => [l.id, decryptToken(l.token_encrypted)]));
  const time = (iso: string) =>
    new Intl.DateTimeFormat("en-NZ", { timeZone: wedding.timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));

  const cards = await Promise.all(
    overview.people
      .filter((p) => p.link)
      .map(async (p) => {
        const token = tokenOf.get(p.link!.id);
        const jobs = (assignees.data ?? [])
          .filter((a) => (p.type === "vendor" ? a.vendor_id : p.type === "guest" ? a.guest_id : a.person_id) === p.id)
          .map((a) => itemById.get(a.item_id))
          .filter((i): i is NonNullable<typeof i> => !!i)
          .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
        return { person: p, jobs, qr: token ? await qrDataUri(absoluteUrl(`/d/${token}`)) : null };
      }),
  );

  return (
    <div className="mx-auto max-w-3xl p-6 print:p-0">
      <h1 className="mb-4 font-serif text-2xl print:hidden">Day links — print</h1>
      {cards.length === 0 ? <p className="text-sm text-muted">Nobody has a link yet. Make some first.</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
        {cards.map(({ person, jobs, qr }) => (
          <section key={`${person.type}:${person.id}`} className="break-inside-avoid rounded border border-line p-4">
            <h2 className="font-serif text-lg">{person.name}</h2>
            <p className="text-xs text-muted">{wedding.name}</p>
            <ul className="my-3 space-y-1 text-sm">
              {jobs.map((j) => (
                <li key={j.id}>
                  {time(j.starts_at)} · {j.title}
                </li>
              ))}
            </ul>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={`QR code for ${person.name}'s link`} width={140} height={140} />
            ) : (
              <p className="text-xs text-red-700">This link can&rsquo;t be recovered. Make a new one.</p>
            )}
            <p className="mt-2 text-xs text-muted">Scan to see your jobs. Please don&rsquo;t share it.</p>
          </section>
        ))}
      </div>
    </div>
  );
}
