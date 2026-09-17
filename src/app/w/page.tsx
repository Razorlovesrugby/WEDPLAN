import { redirect, notFound } from "next/navigation";
import { firstWeddingSlug } from "@/server/queries/site";

/**
 * The bare `/w`, kept alive as a redirect (spec 14 §11).
 *
 * V1 served the site here and resolved "the first wedding by created_at",
 * which this spec replaced with a slug. The path itself cannot simply go: it
 * is linked from `/privacy`, it is what `revalidatePath("/w")` targets, and it
 * is whatever guests have already bookmarked or been sent.
 *
 * So it resolves the same wedding V1 would have and redirects to its address.
 * New links carry the slug.
 */
export const dynamic = "force-dynamic";

export default async function PublicSiteRedirect() {
  const slug = await firstWeddingSlug();
  if (!slug) notFound();
  redirect(`/w/${slug}`);
}
