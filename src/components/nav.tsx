"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/guests", label: "Guests" },
  { href: "/guests/rank", label: "Ranking" },
  { href: "/events", label: "Events" },
  { href: "/invitations", label: "Invitations" },
  { href: "/questions", label: "Questions" },
] as const;

export function Nav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-wrap gap-1">
      {LINKS.map((link) => {
        // "/" would otherwise match everything; "/guests" must not stay lit
        // while you are on "/guests/rank", which is its own destination.
        const active =
          link.href === "/"
            ? pathname === "/"
            : pathname === link.href ||
              (pathname.startsWith(`${link.href}/`) && link.href !== "/guests");

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded px-3 py-1.5 text-sm transition-colors ${
              active ? "bg-ink text-white" : "text-muted hover:bg-line/50 hover:text-ink"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
