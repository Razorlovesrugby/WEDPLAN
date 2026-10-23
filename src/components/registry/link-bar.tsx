"use client";

import { useState } from "react";

/**
 * The address to send, with Copy and Preview. Says plainly when the page is off
 * so nobody sends a link that shows "This link isn't active".
 */
export function RegistryLinkBar({
  url,
  previewHref,
  enabled,
  open,
}: {
  url: string;
  previewHref: string;
  enabled: boolean;
  open: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused (an in-app browser); the address is on screen to select.
    }
  }

  return (
    <div className="card flex flex-wrap items-center gap-3 p-3 text-sm">
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
          enabled ? "bg-green-100 text-green-900" : "bg-line text-muted"
        }`}
      >
        {!enabled ? "Off" : open ? "Live" : "Closed to new gifts"}
      </span>
      <code className="min-w-0 flex-1 truncate text-xs sm:text-sm" title={url}>
        {url}
      </code>
      <button type="button" className="btn" onClick={copy}>
        {copied ? "Copied" : "Copy link"}
      </button>
      <a className="btn" href={previewHref} target="_blank" rel="noopener">
        Preview
      </a>
      <a className="btn" href="/api/registry/qr" target="_blank" rel="noopener" title="A QR code for an invitation insert or shower card">
        QR code
      </a>
      {!enabled ? (
        <p className="w-full text-xs text-muted">
          Nobody can open this yet. Turn the page on under <em>Page &amp; address</em> when
          you&rsquo;re ready.
        </p>
      ) : null}
    </div>
  );
}
