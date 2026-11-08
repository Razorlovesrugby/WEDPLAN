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
      <summary className="cursor-pointer list-none rounded px-2 py-1 text-xs text-muted hover:bg-line/50 hover:text-ink">
        {email ?? "Account"} <span aria-hidden>▾</span>
      </summary>
      <div className="absolute right-0 z-40 mt-1 w-48 rounded-md border border-line bg-white p-1 text-sm shadow-lg">
        {canOpenSettings ? (
          <Link href="/settings#account" className="block rounded px-3 py-1.5 hover:bg-line/50">
            Account settings
          </Link>
        ) : null}
        <form action={signOut}>
          <button type="submit" className="block w-full rounded px-3 py-1.5 text-left hover:bg-line/50">
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
