/**
 * Line icons for the phone navigation (spec 48), drawn in the spirit of SF
 * Symbols: 24px grid, round caps, one stroke weight. Inline SVG, so no icon
 * font or library to load. Decoration only: the label beside each one is
 * what a screen reader reads.
 */

const PATHS: Record<string, string> = {
  // Today
  "/": "M3.5 10.5 12 3.75l8.5 6.75V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6H5A1.5 1.5 0 0 1 3.5 19v-8.5Z",
  // Tasks
  "/lists": "M9 6.5h11M9 12h11M9 17.5h11M4 6.5l1 1 2-2M4 12l1 1 2-2M4 17.5l1 1 2-2",
  // Guests
  "/guests":
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c1.6.8 2.7 2.6 3 5.2",
  // Website
  "/site":
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z",
  // More
  more: "M5 12h.01M12 12h.01M19 12h.01",
  "/budget": "M3 7.5h18v10H3v-10Zm9 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 10.5v4M18 10.5v4",
  "/vendors": "M4 9.5V20h16V9.5M3 9.5 5 4h14l2 5.5a2.6 2.6 0 0 1-4.5 1.6 2.9 2.9 0 0 1-4.5 0 2.9 2.9 0 0 1-4.5 0A2.6 2.6 0 0 1 3 9.5ZM10 20v-5h4v5",
  "/moodboards": "M4 5h16v14H4V5Zm0 10 4.5-4.5L13 15m-1.5-1.5 2.5-2.5 6 6M15.5 9.5h.01",
  "/events": "M4 6h16v14H4V6Zm0 4h16M8.5 3.5v4M15.5 3.5v4",
  "/invitations": "M3.5 6h17v12h-17V6Zm0 0L12 13l8.5-7",
  "/gifts": "M4 11h16v9H4v-9Zm-1-4h18v4H3V7Zm9 0v13M12 7c-1-2.5-4.5-3.5-4.5-1S12 7 12 7Zm0 0c1-2.5 4.5-3.5 4.5-1S12 7 12 7Z",
  "/inbox": "M4 13.5 6.5 5h11l2.5 8.5V19H4v-5.5Zm0 0h4.5l1 2h5l1-2H20",
  "/settings":
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-1.5 1.6 1.2-2 3.5-1.9-.8a7 7 0 0 1-2 1.2L14.8 21h-4l-.3-2.2a7 7 0 0 1-2-1.2l-1.9.8-2-3.5 1.6-1.2a7 7 0 0 1 0-2.4L4.6 9.9l2-3.5 1.9.8a7 7 0 0 1 2-1.2L10.8 3h4l.3 2.2a7 7 0 0 1 2 1.2l1.9-.8 2 3.5-1.6 1.2a7 7 0 0 1 0 2.4Z",
};

/** The fallback for a place without its own drawing: a plain circle. */
const FALLBACK = "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z";

export function NavIcon({ name, className = "h-6 w-6" }: { name: string; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "more" ? 3 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={PATHS[name] ?? FALLBACK} />
    </svg>
  );
}
