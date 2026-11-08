import { DesignFrame } from "@/components/design/design-frame";
import { getPreviewHouseholds } from "@/server/queries/design";
import Link from "next/link";
import { requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Extras · Website" };

/**
 * `/site/extras` (spec 41 §4.5). The screens a site block's content lives on
 * were a list under "Elsewhere" at the bottom of the builder's rail; this
 * gives them a tab of their own. The rail keeps its list as a shortcut.
 */
const EXTRAS = [
  { href: "/site/attire", label: "What to wear", hint: "Dress code and outfit ideas, per event." },
  { href: "/site/gifts", label: "A gift", hint: "Gift funds and bank details for the gifts block." },
  { href: "/site/songs", label: "Song requests", hint: "What guests asked the band or DJ to play." },
  { href: "/site/guestbook", label: "Guestbook", hint: "Notes guests leave on the site, to approve." },
] as const;

export default async function SiteExtrasPage() {
  const wedding = await requireWedding();
  const households = await getPreviewHouseholds(wedding.id);
  return (
    <DesignFrame preview={{ households }}>
      <h1 className="font-serif text-2xl">Extras</h1>
      <ul className="card max-w-2xl divide-y divide-line">
        {EXTRAS.map((extra) => (
          <li key={extra.href}>
            <Link href={extra.href} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-line/30">
              <span>
                <span className="block font-medium">{extra.label}</span>
                <span className="block text-sm text-muted">{extra.hint}</span>
              </span>
              <span aria-hidden className="text-muted">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </DesignFrame>
  );
}
