import { requireWedding } from "@/server/queries/wedding";
import { getRegistryItems, getRegistryTags } from "@/server/queries/registry";
import { ItemEditor } from "@/components/registry/item-editor";

export const metadata = { title: "Registry · Items" };

export default async function RegistryItemsPage() {
  const wedding = await requireWedding();
  const [items, tags] = await Promise.all([getRegistryItems(wedding.id), getRegistryTags(wedding.id)]);

  return <ItemEditor items={items} tags={tags} />;
}
