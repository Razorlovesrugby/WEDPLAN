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

/** The frame a `?panel=` opens in: a titled card at the top of the section, with a Done link that drops the panel. */
export function SectionPanel({
  id,
  title,
  doneHref,
  children,
}: {
  id: string;
  title: string;
  doneHref: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="card space-y-4 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`${id}-title`} className="text-sm font-medium uppercase tracking-wide text-muted">
          {title}
        </h2>
        <Link href={doneHref} className="btn">
          Done
        </Link>
      </div>
      {children}
    </section>
  );
}
