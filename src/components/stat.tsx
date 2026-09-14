import Link from "next/link";

/**
 * A dashboard number.
 *
 * Every one of these links somewhere. The spec's rule is that a number you
 * cannot click through to the list behind it is a number you cannot act on,
 * and it will be the number you distrust at 11pm three weeks before the day.
 */
export function Stat({
  label,
  value,
  href,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  href: string;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneClass = {
    neutral: "text-ink",
    good: "text-tierA",
    warn: "text-tierB",
    bad: "text-red-700",
  }[tone];

  return (
    <Link
      href={href}
      className="card block p-4 transition-shadow hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
    >
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 font-serif text-3xl tabular-nums ${toneClass}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </Link>
  );
}
