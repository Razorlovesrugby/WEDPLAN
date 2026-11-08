import Link from "next/link";
import { Suspense } from "react";
import { AccountMenu } from "@/components/shell/account-menu";
import { CommandPalette, PaletteButton } from "@/components/shell/command-palette";
import { ShellFrame } from "@/components/shell/shell-frame";
import { Sidebar } from "@/components/shell/sidebar";
import { TabBar } from "@/components/shell/tab-bar";
import { getCurrentWedding, getSessionUser, getViewerKind } from "@/server/queries/wedding";
import { daysUntil, formatDate } from "@/lib/format";
import { CurrencyProvider } from "@/components/currency-context";
import { getInboxNeedsYouCount } from "@/server/queries/inbox";

/**
 * The app shell (spec 41): a grouped sidebar from `md:` up, a tab bar below
 * it, and a slim header with the wedding and an account menu. Every place in
 * either comes from `src/lib/nav-groups.ts`.
 */
export default async function PlannerLayout({ children }: { children: React.ReactNode }) {
  const [user, wedding, viewer] = await Promise.all([getSessionUser(), getCurrentWedding(), getViewerKind()]);
  const countdown = daysUntil(wedding?.wedding_date);
  const navViewer = viewer === "planner" ? "planner" : "couple";
  // The Inbox badge (spec 43 Q5): only what needs the couple. A planner has no Inbox.
  const inboxCount = wedding && navViewer === "couple" ? await getInboxNeedsYouCount(wedding.id) : 0;
  const badges = { "/inbox": inboxCount };

  return (
    <ShellFrame sidebar={<Sidebar viewer={navViewer} badges={badges} />} canOpenSettings={navViewer === "couple"}>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-3 px-4 py-3">
          <div className="flex items-baseline gap-3">
            <Link href="/" className="font-serif text-lg">
              {wedding?.name ?? "Wedding"}
            </Link>
            {wedding?.wedding_date ? (
              <span className="text-xs text-muted">
                {formatDate(wedding.wedding_date, wedding.timezone)}
                {countdown !== null && countdown >= 0 ? ` · ${countdown} days` : null}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-1">
            <PaletteButton />
            <AccountMenu email={user?.email ?? null} canOpenSettings={navViewer === "couple"} />
          </div>
        </div>
      </header>

      {/* Bottom padding below md: so the fixed tab bar never covers the end of a page. */}
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 md:pb-6">
        <CurrencyProvider currency={wedding?.currency ?? "NZD"}>{children}</CurrencyProvider>
      </main>

      {/* useSearchParams needs a Suspense boundary. */}
      <CommandPalette viewer={navViewer} />

      <Suspense fallback={null}>
        <TabBar viewer={navViewer} badges={badges} />
      </Suspense>
    </ShellFrame>
  );
}
