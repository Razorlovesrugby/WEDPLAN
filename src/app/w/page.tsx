import { notFound } from "next/navigation";

/**
 * The bare `/w` used to redirect to the first wedding's shared page. That page
 * is gone (spec 28 §7a.4), and a redirect would only lead to its 404 while
 * confirming which wedding is first.
 */
export const dynamic = "force-dynamic";

export default function NoSiteIndex() {
  notFound();
}
