import { FloralRule } from "./rule";

/**
 * One section of the public site (spec 14 §5).
 *
 * Centred heading over left-aligned content, which is the Script preset's
 * whole composition rule: centred *data* — times, addresses, a schedule — is
 * unreadable, so only the heading and its intro are centred.
 *
 * The id is what the nav's anchors target.
 */
export function SiteSection({
  id,
  heading,
  intro,
  rule = true,
  children,
}: {
  id: string;
  heading: string;
  intro?: string | null;
  rule?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="site-reveal scroll-mt-16 px-5 py-12 sm:py-16">
      <div className="mx-auto max-w-2xl">
        {rule ? <FloralRule className="mb-8" /> : null}
        <h2 className="text-center font-script text-4xl leading-tight text-ink sm:text-5xl">
          {heading}
        </h2>
        {intro ? (
          <p className="mx-auto mt-4 max-w-prose text-center text-[1.0625rem] leading-relaxed text-muted">
            {intro}
          </p>
        ) : null}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

/**
 * A small-caps-style label: times, dress codes, field labels.
 *
 * Letterspaced uppercase rather than `font-variant-caps: small-caps`. EB
 * Garamond's web build exposes no `smcp` feature, so asking for small caps
 * would get the browser's synthesised ones — real capitals scaled down, which
 * come out thin and stretched next to the genuine article. Tracked uppercase
 * is what stationery does anyway.
 */
export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`text-[0.7rem] font-medium uppercase tracking-[0.14em] text-muted ${className ?? ""}`}
    >
      {children}
    </span>
  );
}
