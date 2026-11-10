import Link from "next/link";
import { signOut } from "@/server/actions/auth";

/**
 * The header's account menu (spec 41 §4.1): it used to be the email address
 * as a sign-out button. A native `<details>` disclosure, so it works without
 * JavaScript and reads as a button to assistive tech and AI assistants.
 * A planner can't open Settings, so they only get Sign out.
 */
export function AccountMenu({ email, canOpenSettings }: { email: string | null; canOpenSettings: boolean }) {
  return (
    <details className="relative">
      <summary
        aria-label="Account"
        className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-full text-xs text-muted hover:bg-line/50 hover:text-ink md:min-h-0 md:min-w-0 md:rounded md:px-2 md:py-1 [&::-webkit-details-marker]:hidden"
      >
        {/* An initial in a circle on a phone (spec 48): a full email crowded the header. */}
        <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold uppercase text-accent md:hidden">
          {(email ?? "?").charAt(0)}
        </span>
        <span className="hidden md:inline">
          {email ?? "Account"} <span aria-hidden>▾</span>
        </span>
      </summary>
      <div className="absolute right-0 z-40 mt-1 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-white p-1 text-sm shadow-lg md:w-48 md:rounded-md">
        {email ? <p className="truncate px-3 py-2 text-xs text-muted md:hidden">{email}</p> : null}
        {canOpenSettings ? (
          <Link href="/settings#account" className="block rounded-lg px-3 py-2.5 hover:bg-line/50 md:rounded md:py-1.5">
            Account settings
          </Link>
        ) : null}
        <form action={signOut}>
          <button type="submit" className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-line/50 md:rounded md:py-1.5">
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
