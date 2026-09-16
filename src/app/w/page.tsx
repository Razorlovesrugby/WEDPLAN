import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Json } from "@/lib/types/database";
import { PublicBoardView } from "@/components/moodboards/public-board";
import { listPublishedBoards } from "@/server/moodboards/resolve";

/**
 * The public site.
 *
 * Deliberately thin, and deliberately server-rendered from structured blocks:
 * the design work belongs in V2 or V3, when there are photographs to design
 * around. What it must do now is exist, carry the practical information, and
 * give guests somewhere to find the RSVP link they have lost.
 *
 * noindex by default. A wedding site that turns up in search results for the
 * couple's names is a decision, not an accident.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type Block = { block_key: string; payload: Json; sort_order: number };

function asRecord(payload: Json): Record<string, string> {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export default async function PublicSitePage() {
  // No session here, so the service role reads. V1 is one wedding, so this
  // takes the first; when there are several this needs a domain or a slug.
  const supabase = createAdminClient();
  const { data: wedding } = await supabase
    .from("weddings")
    .select("id, name, wedding_date, timezone")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!wedding) {
    return (
      <main className="mx-auto max-w-lg px-6 py-20 text-center">
        <p className="text-sm text-muted">Nothing to see here yet.</p>
      </main>
    );
  }

  const [{ data: blocks }, { data: events }] = await Promise.all([
    supabase
      .from("site_content")
      .select("block_key, payload, sort_order")
      .eq("wedding_id", wedding.id)
      .eq("visible", true)
      .order("sort_order"),
    supabase
      .from("events")
      .select("*")
      .eq("wedding_id", wedding.id)
      .eq("is_public", true)
      .order("sort_order")
      .order("starts_at"),
  ]);

  const boards = await listPublishedBoards(wedding.id, "public_site");

  const byKey = new Map((blocks ?? []).map((block) => [block.block_key, block as Block]));
  const hero = asRecord(byKey.get("hero")?.payload ?? null);
  const travel = asRecord(byKey.get("travel")?.payload ?? null);
  const schedule = asRecord(byKey.get("schedule")?.payload ?? null);

  const faqPayload = byKey.get("faq")?.payload;
  const faqItems =
    faqPayload && typeof faqPayload === "object" && !Array.isArray(faqPayload) && Array.isArray(faqPayload["items"])
      ? (faqPayload["items"] as Json[])
          .map((item) => (item && typeof item === "object" && !Array.isArray(item) ? item : null))
          .filter((item): item is Record<string, Json> => item !== null)
      : [];

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <header className="border-b border-line pb-10 text-center">
        <h1 className="font-serif text-4xl">{hero["headline"] ?? wedding.name}</h1>
        <p className="mt-2 text-muted">
          {hero["date_label"] ??
            (wedding.wedding_date ? formatDate(wedding.wedding_date, wedding.timezone) : "")}
        </p>
        {hero["location"] ? <p className="text-muted">{hero["location"]}</p> : null}
      </header>

      {(events ?? []).length > 0 ? (
        <section className="border-b border-line py-10">
          <h2 className="font-serif text-2xl">The day</h2>
          {schedule["intro"] ? <p className="mt-2 text-sm text-muted">{schedule["intro"]}</p> : null}
          <ul className="mt-4 space-y-3">
            {(events ?? []).map((event) => (
              <li key={event.id}>
                <p className="font-medium">{event.name}</p>
                <p className="text-sm text-muted">
                  {event.starts_at ? formatDateTime(event.starts_at, wedding.timezone) : null}
                  {event.venue ? ` · ${event.venue}` : null}
                </p>
                {event.address ? <p className="text-sm text-muted">{event.address}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {travel["body"] ? (
        <section className="border-b border-line py-10">
          <h2 className="font-serif text-2xl">Getting there</h2>
          <p className="mt-2 whitespace-pre-line text-sm">{travel["body"]}</p>
        </section>
      ) : null}

      {faqItems.length > 0 ? (
        <section className="border-b border-line py-10">
          <h2 className="font-serif text-2xl">Questions</h2>
          <dl className="mt-4 space-y-4">
            {faqItems.map((item, index) => (
              <div key={index}>
                <dt className="font-medium">{String(item["q"] ?? "")}</dt>
                <dd className="text-sm text-muted">{String(item["a"] ?? "")}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {boards.map((board) => (
        <section key={board.board.id} className="border-b border-line py-10">
          <h2 className="font-serif text-2xl">{board.board.title}</h2>
          {board.board.description ? (
            <p className="mb-4 mt-2 whitespace-pre-line text-sm text-muted">{board.board.description}</p>
          ) : null}
          <PublicBoardView board={board} />
        </section>
      ))}

      <section className="py-10 text-center">
        <h2 className="font-serif text-2xl">RSVP</h2>
        <p className="mt-2 text-sm text-muted">
          Use the link in your invitation — it&rsquo;s personal to your household. If you can&rsquo;t
          find it, message us and we&rsquo;ll send it again.
        </p>
      </section>
    </main>
  );
}
