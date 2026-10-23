"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { releaseOwnClaim, type OwnClaim } from "@/server/actions/registry-public";

export function OwnClaimView({ token, claim }: { token: string; claim: OwnClaim }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { receipt } = claim;

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(receipt.address.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Refused clipboard (in-app browser): the address is on screen to select.
    }
  }

  function release() {
    if (!window.confirm("Put this back on the registry? The couple will see that you changed your mind.")) return;
    startTransition(async () => {
      const result = await releaseOwnClaim(token);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  if (claim.released) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="font-display text-3xl">Done — it&rsquo;s back on the list</h1>
        <p className="text-muted">{receipt.itemTitle} is available again. Thank you for letting them know.</p>
        {claim.slug ? <a className="inline-block rounded-full bg-accent px-6 py-3 font-medium text-paper" href={`/registry/${claim.slug}`}>See the registry</a> : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="site-label text-muted">{claim.weddingName}</p>
        <h1 className="mt-1 font-display text-3xl leading-tight">
          Your gift: {claim.quantity > 1 ? `${claim.quantity} × ` : ""}{receipt.itemTitle}
        </h1>
      </div>

      {receipt.thanksText ? <p className="whitespace-pre-line leading-relaxed">{receipt.thanksText}</p> : null}

      <section className="space-y-2 rounded-2xl border border-line p-4">
        <h2 className="font-medium">Get it to them</h2>
        {receipt.buyUrl ? (
          <p><a href={receipt.buyUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline">Buy it here ↗</a></p>
        ) : null}
        {receipt.address.length > 0 ? (
          <>
            <address className="whitespace-pre-line not-italic">{receipt.address.join("\n")}</address>
            {receipt.courierNote ? <p className="text-sm italic text-muted">{receipt.courierNote}</p> : null}
            <button type="button" onClick={copyAddress} className="rounded-full border border-line px-4 py-1.5 text-sm hover:bg-line/40">{copied ? "Copied" : "Copy address"}</button>
          </>
        ) : (
          <p className="text-sm text-muted">The couple haven&rsquo;t added a delivery address yet.</p>
        )}
      </section>

      {claim.canRelease ? (
        <section className="space-y-2 text-sm">
          <h2 className="font-medium">Changed your mind?</h2>
          <button type="button" onClick={release} disabled={pending} className="rounded-full border border-line px-4 py-2 hover:bg-line/40 disabled:opacity-60">
            {pending ? "One moment…" : "Put it back on the registry"}
          </button>
          {error ? <p role="alert" className="text-red-700">{error}</p> : null}
        </section>
      ) : (
        <p className="text-sm text-muted">The couple have marked this as arrived, so it can&rsquo;t be put back. Thank you!</p>
      )}
    </div>
  );
}
