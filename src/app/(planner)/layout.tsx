import Link from "next/link";
import { Suspense } from "react";
import { AccountMenu } from "@/components/shell/account-menu";
import { ShellFrame } from "@/components/shell/shell-frame";
import { Sidebar } from "@/components/shell/sidebar";
import { TabBar } from "@/components/shell/tab-bar";
import { getCurrentWedding, getSessionUser, getViewerKind } from "@/server/queries/wedding";
import { daysUntil, formatDate } from "@/lib/format";
import { CurrencyProvider } from "@/components/currency-context";

/**
 * The app shell (spec 41): a grouped sidebar from `md:` up, a tab bar below
 * it, and a slim header with the wedding and an account menu. Every place in
 * either comes from `src/lib/nav-groups.ts`.
 */
export default async function PlannerLayout({ children }: { children: React.ReactNode }) {
  const [user, wedding, viewer] = await Promise.all([getSessionUser(), getCurrentWedding(), getViewerKind()]);
  const countdown = daysUntil(wedding?.wedding_date);
  const navViewer = viewer === "planner" ? "planner" : "couple";

  return (
    <ShellFrame sidebar={<Sidebar viewer={navViewer} />}>
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

          <AccountMenu email={user?.email ?? null} canOpenSettings={navViewer === "couple"} />
        </div>
      </header>

      {/* Bottom padding below md: so the fixed tab bar never covers the end of a page. */}
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 md:pb-6">
        <CurrencyProvider currency={wedding?.currency ?? "NZD"}>{children}</CurrencyProvider>
      </main>

      {/* useSearchParams needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <TabBar viewer={navViewer} />
      </Suspense>
    </ShellFrame>
  );
}
