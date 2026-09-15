import { notFound } from "next/navigation";
import { ListsSidebar } from "@/components/lists/lists-sidebar";
import { ListDetail } from "@/components/lists/list-detail";
import { getListDetail, getLists } from "@/server/queries/lists";
import { getCollaborators, getSessionUser, requireWedding } from "@/server/queries/wedding";

export default async function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wedding = await requireWedding();

  const [lists, detail, collaborators, user] = await Promise.all([
    getLists(wedding.id),
    getListDetail(wedding.id, id),
    getCollaborators(wedding.id),
    getSessionUser(),
  ]);

  if (!detail) notFound();

  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      <ListsSidebar lists={lists} />
      <div className="min-w-0 flex-1">
        <ListDetail
          list={detail.list}
          sections={detail.sections}
          items={detail.items}
          collaborators={collaborators}
          currentUserId={user?.id}
        />
      </div>
    </div>
  );
}
