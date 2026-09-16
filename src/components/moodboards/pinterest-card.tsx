"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { beginPinterestConnect, disconnectPinterest } from "@/server/actions/pinterest";
import type { PinterestAccountRow } from "@/lib/types/database";

export function PinterestCard({
  account,
  configured,
}: {
  account: PinterestAccountRow | null;
  configured: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-serif text-xl">Pinterest</h2>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {!configured ? (
        <p className="text-sm text-muted">
          Not configured on this deployment. Register an app at Pinterest&rsquo;s developer portal and
          set <code>PINTEREST_APP_ID</code> and <code>PINTEREST_APP_SECRET</code>. The redirect URI is
          this site&rsquo;s <code>/api/pinterest/callback</code>, and it has to be https — a plain
          localhost callback is usually rejected.
        </p>
      ) : account ? (
        <>
          <p className="text-sm">
            Connected{account.username ? ` as ${account.username}` : ""}. Read-only: this can list
            your boards and pins, and nothing else.
          </p>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await disconnectPinterest();
                if (!result.ok) setError(result.error);
                else router.refresh();
              })
            }
          >
            Disconnect
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            Connect an account to import a board into a moodboard. Read-only scopes only.
          </p>
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await beginPinterestConnect();
                if (!result.ok) setError(result.error);
                else window.location.href = result.data.url;
              })
            }
          >
            Connect Pinterest
          </button>
        </>
      )}
    </section>
  );
}
