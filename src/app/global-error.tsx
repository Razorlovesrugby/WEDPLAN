"use client";

/**
 * The boundary of last resort: an error in the root layout itself, where
 * error.tsx cannot help because the layout that would wrap it is the thing
 * that failed. It has to render its own <html> and <body>, and it cannot use
 * Tailwind classes from a stylesheet the failed layout never loaded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          padding: "96px 24px",
          textAlign: "center",
          color: "#1c1917",
          background: "#fafaf9",
        }}
      >
        <h1 style={{ fontSize: 22, margin: 0 }}>This site isn&rsquo;t loading</h1>
        <p style={{ color: "#78716c", fontSize: 14, marginTop: 8 }}>
          Something failed before the page could render at all.
        </p>
        {error.digest ? (
          <p style={{ color: "#78716c", fontSize: 12, marginTop: 16 }}>
            Reference <code>{error.digest}</code>
          </p>
        ) : null}
        <p style={{ marginTop: 24 }}>
          <button type="button" onClick={reset} style={{ padding: "6px 12px", cursor: "pointer" }}>
            Try again
          </button>{" "}
          <a href="/api/health" style={{ marginLeft: 8, fontSize: 14 }}>
            Check what&rsquo;s wrong
          </a>
        </p>
      </body>
    </html>
  );
}
