"use client";

import { useEffect } from "react";

/**
 * What a thrown Server Component renders instead of a blank page.
 *
 * Next.js's default is "Application error: a server-side exception has
 * occurred (see the server logs for more information)", which is true and
 * useless: the person looking at it usually cannot read those logs, and there
 * is nothing on screen to correlate with them.
 *
 * So this shows the digest — the id Next.js also writes into the log line —
 * and points at /api/health, which answers the three realistic causes without
 * anyone having to open a dashboard.
 *
 * It never shows `error.message`. In production that is already redacted for
 * server errors, and a page that renders internals to whoever visits is a
 * page that leaks them to a stranger holding a share link.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="font-serif text-2xl">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">
        This page couldn&rsquo;t load. It&rsquo;s usually the database being unreachable or a
        migration that hasn&rsquo;t been applied yet.
      </p>

      {error.digest ? (
        <p className="mt-4 text-xs text-muted">
          Reference <code className="font-mono">{error.digest}</code> — this appears in the server
          log line for the same request.
        </p>
      ) : null}

      <div className="mt-6 flex justify-center gap-2">
        <button type="button" className="btn-primary" onClick={reset}>
          Try again
        </button>
        <a className="btn" href="/api/health">
          Check what&rsquo;s wrong
        </a>
      </div>
    </main>
  );
}
