import Link from "next/link";
import { InboxList } from "@/components/inbox/inbox-list";
import {
  INBOX_FILTERS,
  INBOX_FILTER_LABEL,
  filterInbox,
  isInboxFilter,
  type InboxFilter,
} from "@/lib/inbox";
import { getInboxItems } from "@/server/queries/inbox";
import { requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Inbox" };

/** The newest this many in "All" and per-kind views; "Needs you" is never cut. */
const LIST_CAP = 200;

/**
 * `/inbox` (spec 43 §4.1): everything guests send in, newest first. Questions,
 * song requests, guestbook notes, registry claims and the last 14 days'
 * can't-comes. Each row's actions call the same server actions as the screen
 * it came from; the full screens are still there, one link away.
 */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const filter: InboxFilter = isInboxFilter(kind) ? kind : "needs";
  const wedding = await requireWedding();
  const items = await getInboxItems(wedding.id);
  const shown = filterInbox(items, filter);
  const visible = filter === "needs" ? shown : shown.slice(0, LIST_CAP);

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="font-serif text-2xl">Inbox</h1>
        <p className="mt-1 text-sm text-muted">
          What guests have sent you: questions, song requests, guestbook notes, registry claims, and
          anyone who&rsquo;s said they can&rsquo;t come in the last 14 days.
        </p>
      </div>

      <nav aria-label="Filter" className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-line bg-line/30 p-0.5">
        {INBOX_FILTERS.map((candidate) => {
          const count = filterInbox(items, candidate).length;
          const active = candidate === filter;
          return (
            <Link
              key={candidate}
              href={candidate === "needs" ? "/inbox" : `/inbox?kind=${candidate}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                active ? "bg-white font-medium text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {INBOX_FILTER_LABEL[candidate]}
              {count > 0 ? <span className="ml-1 text-xs text-muted">{count}</span> : null}
            </Link>
          );
        })}
      </nav>

      {visible.length === 0 ? (
        <p className="card p-8 text-center text-sm text-muted">
          {filter === "needs" ? "Nothing needs you. Everything guests have sent is handled." : "Nothing here yet."}
        </p>
      ) : (
        <InboxList items={visible} timeZone={wedding.timezone} />
      )}
      {shown.length > visible.length ? (
        <p className="text-sm text-muted">Showing the newest {LIST_CAP} of {shown.length}.</p>
      ) : null}
    </div>
  );
}
