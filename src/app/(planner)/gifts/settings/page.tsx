import { requireWedding } from "@/server/queries/wedding";
import { getRegistrySettings, getRegistryShipping } from "@/server/queries/registry";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm, type ImageOption } from "@/components/registry/settings-form";

export const metadata = { title: "Registry · Page & address" };

export default async function RegistrySettingsPage() {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const [settings, shipping, assets] = await Promise.all([
    getRegistrySettings(wedding.id),
    getRegistryShipping(wedding.id),
    // The registry's own pictures, and the site's, so a hero can reuse a photograph already uploaded.
    supabase
      .from("site_assets")
      .select("id, kind, alt, focal_x, focal_y")
      .eq("wedding_id", wedding.id)
      .in("kind", ["registry", "hero", "story", "gallery"])
      .is("uploaded_by_household", null)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  const images: ImageOption[] = (assets.data ?? []).map((a) => ({
    id: a.id,
    kind: a.kind,
    alt: a.alt,
    focal: a.focal_x !== null && a.focal_y !== null ? { x: a.focal_x, y: a.focal_y } : null,
  }));

  return <SettingsForm settings={settings} shipping={shipping} images={images} />;
}
