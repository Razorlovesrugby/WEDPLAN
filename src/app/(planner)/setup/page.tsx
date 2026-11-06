import Link from "next/link";
import { onboardingOpen } from "@/lib/env";
import { getSessionUser } from "@/server/queries/wedding";

export const metadata = { title: "Set up" };

/**
 * Where `requireWedding()` sends someone whose account exists but who is not
 * attached to a wedding. Since spec 40 they can finish at /start, which skips
 * the account fields for a signed-in person. The SQL route (bootstrap.sql) is
 * still described, for when sign-ups are switched off.
 */
export default async function SetupPage() {
  const user = await getSessionUser();
  const open = onboardingOpen();

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="font-serif text-2xl">Almost there</h1>

      <p className="text-sm">
        You&rsquo;re signed in as <strong>{user?.email}</strong>, but this account isn&rsquo;t
        attached to a wedding yet, so there&rsquo;s nothing to show.
      </p>

      {open ? (
        <p>
          <Link className="btn-primary" href="/start">
            Set up your wedding
          </Link>
        </p>
      ) : null}

      <div className="card space-y-3 p-4 text-sm">
        <p className="font-medium">{open ? "Or, if you run this site" : "To fix it"}</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Open <code className="rounded bg-line/50 px-1">supabase/bootstrap.sql</code> from the
            repository.
          </li>
          <li>Edit the values at the top: names, date, both email addresses, timezone, currency.</li>
          <li>
            Paste the whole file into the Supabase SQL editor and run it, then reload this page.
          </li>
        </ol>
        <p className="text-muted">
          If you have already run it, check that the email above matches the one you put in{" "}
          <code className="rounded bg-line/50 px-1">v_owner_email</code>: the two have to be the
          same account.
        </p>
      </div>
    </div>
  );
}
