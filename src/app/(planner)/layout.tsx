import Link from "next/link";
import { Nav } from "@/components/nav";
import { signOut } from "@/server/actions/auth";
import { getCurrentWedding, getSessionUser } from "@/server/queries/wedding";
import { daysUntil, formatDate } from "@/lib/format";

export default async function PlannerLayout({ children }: { children: React.ReactNode }) {
  const [user, wedding] = await Promise.all([getSessionUser(), getCurrentWedding()]);
  const countdown = daysUntil(wedding?.wedding_date);

  return (
    <div className="min-h-dvh">
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

          <form action={signOut}>
            <button type="submit" className="text-xs text-muted hover:text-ink">
              {user?.email} · Sign out
            </button>
          </form>
        </div>

        <div className="mx-auto max-w-6xl px-4 pb-2">
          <Nav />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
