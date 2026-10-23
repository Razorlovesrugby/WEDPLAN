import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicRegistry } from "@/server/registry/public";
import { getCurrentWedding } from "@/server/queries/wedding";
import { RegistryView } from "@/components/registry/public/registry-view";

/**
 * The public registry (spec 36 §4): one address, sent to anyone.
 *
 * No nav, no login prompt, no app chrome — a page, not the app. noindex, always:
 * these are a couple's wishes and a link they chose to send, not something a
 * search engine should list. Unknown, switched-off and malformed all render the
 * same bare 404, so the address can't be used to ask whether a registry exists.
 *
 * It never reads claims or the delivery address (see `loadPublicRegistry`).
 */

export const dynamic = "force-dynamic";

type Params = { slug: string };
type SearchParams = Record<string, string | string[] | undefined>;

async function previewAllowed(slug: string, search: SearchParams): Promise<boolean> {
  if (search.preview !== "1") return false;
  try {
    // Only the signed-in couple of THIS wedding may preview an unpublished page.
    const wedding = await getCurrentWedding();
    return wedding?.slug === slug;
  } catch {
    return false;
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const registry = await loadPublicRegistry(slug, { preview: await previewAllowed(slug, await searchParams) });
  const title = registry ? `${registry.settings.title || registry.weddingName} · Registry` : "Registry";
  return {
    title,
    description: registry?.settings.intro ?? undefined,
    robots: { index: false, follow: false },
  };
}

export default async function PublicRegistryPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const registry = await loadPublicRegistry(slug, { preview: await previewAllowed(slug, search) });
  if (!registry) notFound();

  return <RegistryView registry={registry} search={search} />;
}
