import Link from "next/link";
import { redirect } from "next/navigation";
import { isTabId, tabsFor } from "@/lib/nav-groups";
import { getViewerKind, requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Menu" };

/**
 * `/menu?group=<tab>` — what a phone tab opens when it holds more than one
 * place (spec 41 §4.2). A real page rather than a popover so it has an
 * address, Back works, and an AI assistant can open it directly. On a laptop
 * the sidebar shows all of this already, but the page still works there.
 */
export default async function MenuPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const { group } = await searchParams;
  await requireWedding();
  const viewer = (await getViewerKind()) === "planner" ? "planner" : "couple";
  const tab = isTabId(group) ? tabsFor(viewer).find((candidate) => candidate.id === group) : undefined;
  if (!tab) redirect("/");

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="font-serif text-2xl">{tab.label}</h1>
      {tab.groups.map((navGroup) => (
        <section key={navGroup.id} aria-labelledby={`menu-${navGroup.id}`} className="space-y-2">
          {tab.groups.length > 1 && navGroup.label ? (
            <h2 id={`menu-${navGroup.id}`} className="text-sm font-medium uppercase tracking-wide text-muted">
              {navGroup.label}
            </h2>
          ) : null}
          <ul className="card divide-y divide-line">
            {navGroup.entries.map((entry) => (
              <li key={entry.href}>
                <Link href={entry.href} className="flex items-center justify-between px-4 py-3 hover:bg-line/30">
                  {entry.label}
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
