"use client";

import Link from "next/link";

/**
 * The Print menu of the seating screen: the printable views and the CSV. One
 * copy, used by the page layout and the focus-mode top bar (spec 59 A.1).
 */
export function PrintMenu({
  eventId,
  printHref,
  unseated,
  align = "right",
}: {
  eventId: string;
  printHref: (view: string) => string;
  unseated: number;
  /** Which edge of the button the list lines up with. */
  align?: "left" | "right";
}) {
  return (
    <details className="relative">
      <summary className="btn cursor-pointer list-none py-1">Print</summary>
      <ul className={`absolute ${align === "right" ? "right-0" : "left-0"} z-30 mt-1 w-64 rounded border border-line bg-white py-1 text-sm shadow-lg`}>
        {unseated > 0 ? (
          <li className="border-b border-line px-3 py-1.5 text-amber-800">
            {unseated} {unseated === 1 ? "person isn't" : "people aren't"} seated yet —{" "}
            <button type="button" className="underline" onClick={() => document.getElementById("seating-tray")?.scrollIntoView({ behavior: "smooth" })}>
              see who
            </button>
          </li>
        ) : null}
        {[
          ["tables", "By table — for the venue"],
          ["names", "By name — the entrance board"],
          ["catering", "Numbers — for the caterer"],
          ["floor", "Floor plan"],
          ["escort", "Escort cards"],
          ["cards", "Place cards"],
        ].map(([v, label]) => (
          <li key={v}>
            <Link href={printHref(v!)} target="_blank" className="block px-3 py-1.5 hover:bg-paper">
              {label}
            </Link>
          </li>
        ))}
        <li className="border-t border-line">
          <a href={`/api/export/seating?event=${eventId}`} className="block px-3 py-1.5 hover:bg-paper">
            Download CSV
          </a>
        </li>
      </ul>
    </details>
  );
}
