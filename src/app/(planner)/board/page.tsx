import Link from "next/link";
import { BoardView } from "@/components/lists/board-view";
import { SubTabs } from "@/components/sub-tabs";
import { TASKS_TABS } from "@/lib/nav-tabs";
import { getBoardItems, getLists } from "@/server/queries/lists";
import { requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Board" };

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  const { list: listId } = await searchParams;
  const wedding = await requireWedding();
  const [items, lists] = await Promise.all([getBoardItems(wedding.id, listId), getLists(wedding.id)]);

  return (
    <div className="space-y-4">
      <SubTabs tabs={TASKS_TABS} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-serif text-2xl">Board</h1>
        <div className="flex flex-wrap gap-1 text-sm">
          <Link href="/board" className={`btn px-2 py-1 text-xs ${!listId ? "bg-ink text-white" : ""}`}>
            Every list
          </Link>
          {lists.map((list) => (
            <Link
              key={list.id}
              href={`/board?list=${list.id}`}
              className={`btn px-2 py-1 text-xs ${listId === list.id ? "bg-ink text-white" : ""}`}
            >
              {list.title}
            </Link>
          ))}
        </div>
      </div>
      <BoardView items={items} />
    </div>
  );
}
