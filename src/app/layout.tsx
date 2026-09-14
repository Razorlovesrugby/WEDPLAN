import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Wedding", template: "%s · Wedding" },
  description: "Guest list and RSVP",
  // The planner is private and the public site is thin and unfinished until
  // V2. Nothing here should be indexed until someone decides otherwise.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
