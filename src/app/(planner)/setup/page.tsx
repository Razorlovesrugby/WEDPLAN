import { getSessionUser } from "@/server/queries/wedding";

export const metadata = { title: "Set up" };

/**
 * Where `requireWedding()` sends someone whose account exists but who is not
 * attached to a wedding.
 *
 * This is not a form, and that is deliberate rather than unfinished:
 * `weddings` has no INSERT policy, because a collaborator inserting a bare
 * wedding row would lose access to it the instant it existed —
 * is_collaborator() would be false for the row they had just created. The
 * first wedding is created in SQL, where the editor has privileges the app
 * never has. This page explains that rather than leaving a dead redirect.
 */
export default async function SetupPage() {
  const user = await getSessionUser();

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="font-serif text-2xl">Almost there</h1>

      <p className="text-sm">
        You&rsquo;re signed in as <strong>{user?.email}</strong>, but this account isn&rsquo;t
        attached to a wedding yet, so there&rsquo;s nothing to show.
      </p>

      <div className="card space-y-3 p-4 text-sm">
        <p className="font-medium">To fix it</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Open <code className="rounded bg-line/50 px-1">supabase/bootstrap.sql</code> from the
            repository.
          </li>
          <li>Edit the values at the top — names, date, both email addresses, capacity.</li>
          <li>
            Paste the whole file into the Supabase SQL editor and run it, then reload this page.
          </li>
        </ol>
        <p className="text-muted">
          If you have already run it, check that the email above matches the one you put in{" "}
          <code className="rounded bg-line/50 px-1">v_owner_email</code> — the two have to be the
          same account.
        </p>
      </div>

      <p className="text-xs text-muted">
        Creating a wedding is a SQL step rather than a screen on purpose. The{" "}
        <code>weddings</code> table has no insert policy: a collaborator who inserted a wedding row
        from the app would immediately lose access to it, because they would not yet be a
        collaborator on it. See <code>supabase/migrations/README.md</code>.
      </p>
    </div>
  );
}
