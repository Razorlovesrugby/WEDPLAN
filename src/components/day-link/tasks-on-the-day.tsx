import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatTime } from "@/lib/format";
import { TasksOnTheDayControls } from "./tasks-on-the-day-controls";

/**
 * "Jobs on the day" for one guest, vendor or helper (spec 54 §10.2): their
 * jobs in time order, a way to assign another or remove one, and the state of
 * their day link.
 */
export async function TasksOnTheDay({
  weddingId,
  assignee,
  timeZone,
}: {
  weddingId: string;
  assignee: { type: "vendor" | "guest" | "person"; id: string };
  timeZone: string;
}) {
  const supabase = await createClient();
  const column = `${assignee.type}_id` as const;
  const [mine, items, link] = await Promise.all([
    supabase.from("run_sheet_item_assignees").select("item_id, state").eq("wedding_id", weddingId).eq(column, assignee.id),
    supabase.from("run_sheet_items").select("id, title, starts_at, ends_at").eq("wedding_id", weddingId).order("starts_at"),
    supabase.from("day_links").select("id").eq("wedding_id", weddingId).eq(column, assignee.id).is("revoked_at", null).maybeSingle(),
  ]);
  for (const r of [mine, items, link]) if (r.error) throw new Error(`Could not load tasks on the day: ${r.error.message}`);

  const state = new Map((mine.data ?? []).map((m) => [m.item_id, m.state]));
  const tasks = (items.data ?? []).filter((i) => state.has(i.id));
  const others = (items.data ?? []).filter((i) => !state.has(i.id));
  const label = { todo: "To do", started: "On it", done: "Done", handed_back: "Handed back" } as const;

  return (
    <section className="card space-y-2 p-4" aria-labelledby="tasks-on-the-day">
      <h2 id="tasks-on-the-day" className="text-sm font-medium uppercase tracking-wide text-muted">Jobs on the day</h2>
      {tasks.length === 0 ? <p className="text-sm text-muted">No jobs yet.</p> : null}
      <ul className="space-y-1 text-sm">
        {tasks.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {formatTime(t.starts_at, timeZone)} {t.title}{" "}
              <span className="text-xs text-muted">{label[state.get(t.id) as keyof typeof label]}</span>
            </span>
            <TasksOnTheDayControls mode="remove" itemId={t.id} assignee={assignee} />
          </li>
        ))}
      </ul>
      <TasksOnTheDayControls
        mode="assign"
        assignee={assignee}
        options={others.map((i) => ({ id: i.id, label: `${formatTime(i.starts_at, timeZone)} ${i.title}` }))}
        hasLink={Boolean(link.data)}
      />
      <p className="text-xs text-muted">
        New job? <Link href="/run-sheet" className="underline">Add it on the run sheet</Link>, then assign it here.{" "}
        <Link href={`/run-sheet/people?who=${assignee.type}:${assignee.id}`} className="underline">See on the run sheet</Link>{" · "}
        <Link href="/run-sheet/links" className="underline">Day links</Link>
      </p>
    </section>
  );
}
