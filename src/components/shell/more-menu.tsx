import Link from "next/link";

/**
 * A section's "⋯" menu (spec 41 §4.4): where a setting that belongs to one
 * section lives, now that Settings holds only what applies to the whole
 * wedding. A native `<details>`, so it needs no JavaScript; each item is a
 * link to a `?panel=` address, so the panel can be linked to and Back closes it.
 */
export function MoreMenu({ label, items }: { label: string; items: { href: string; label: string }[] }) {
  if (items.length === 0) return null;
  return (
    <details className="relative">
      <summary className="btn cursor-pointer list-none" aria-label={label} title={label}>
        <span aria-hidden>⋯</span>
      </summary>
      <div className="absolute right-0 z-40 mt-1 w-56 rounded-md border border-line bg-white p-1 text-sm shadow-lg">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="block rounded px-3 py-1.5 hover:bg-line/50">
            {item.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
