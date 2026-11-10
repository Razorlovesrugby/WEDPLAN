import Link from "next/link";
import { moreGroupsFor } from "@/lib/nav-groups";
import { getViewerKind, requireWedding } from "@/server/queries/wedding";
import { NavIcon } from "@/components/shell/nav-icon";

export const metadata = { title: "More" };

/**
 * `/menu` — every place that isn't on a phone tab (spec 48). The tab bar's
 * More button opens the same list as a sheet; this page is what that link
 * reaches before JavaScript has loaded, or when it's opened in a new tab.
 * Old `/menu?group=…` links land here too.
 */
export default async function MenuPage() {
  await requireWedding();
  const viewer = (await getViewerKind()) === "planner" ? "planner" : "couple";
  const groups = moreGroupsFor(viewer);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="font-serif text-2xl">More</h1>
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={group.label ? `menu-${group.id}` : undefined} className="space-y-2">
          {group.label ? (
            <h2 id={`menu-${group.id}`} className="px-1 text-xs font-medium uppercase tracking-wide text-muted">
              {group.label}
            </h2>
          ) : null}
          <ul className="card divide-y divide-line overflow-hidden">
            {group.entries.map((entry) => (
              <li key={entry.href}>
                <Link href={entry.href} className="flex min-h-12 items-center gap-3 px-4 hover:bg-line/30 active:bg-line/50">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <NavIcon name={entry.href} className="h-5 w-5" />
                  </span>
                  <span className="flex-1">{entry.label}</span>
                  <span aria-hidden className="text-muted">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
