import type { ReactNode } from "react";
import { requireWedding } from "@/server/queries/wedding";
import { getRegistrySettings } from "@/server/queries/registry";
import { absoluteUrl } from "@/lib/env";
import { SubTabs } from "@/components/sub-tabs";
import { RegistryLinkBar } from "@/components/registry/link-bar";

export const metadata = { title: "Registry" };

/**
 * `/gifts` — the registry's planner screens (spec 36 §5). The route is `/gifts`
 * and the nav label is "Registry" because `/registry/<slug>` is the PUBLIC page
 * and the public-path list matches whole segments by prefix: a planner screen at
 * `/registry` would have been publicly reachable.
 */
export default async function GiftsLayout({ children }: { children: ReactNode }) {
  const wedding = await requireWedding();
  const settings = await getRegistrySettings(wedding.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl">Registry</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Things you&rsquo;d love, each a link to a shop. Send one address to anyone &mdash; a
          guest, or a friend who can&rsquo;t make it. When someone says they&rsquo;ll buy
          something it comes off the list, and only you see who and what they wrote.
        </p>
      </div>

      <RegistryLinkBar
        url={absoluteUrl(`/registry/${wedding.slug}`)}
        previewHref={`/registry/${wedding.slug}?preview=1`}
        enabled={settings.enabled}
        open={settings.open}
      />

      <SubTabs
        tabs={[
          { href: "/gifts", label: "Items" },
          { href: "/gifts/claims", label: "Claims" },
          { href: "/gifts/settings", label: "Page & address" },
        ]}
      />
      {children}
    </div>
  );
}
