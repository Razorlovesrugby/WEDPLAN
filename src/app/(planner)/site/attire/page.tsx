import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { getDressCodes } from "@/server/queries/site-extras";
import { AttireEditor } from "@/components/site/editor/attire-editor";
import type { EventRow, MoodboardRow } from "@/lib/types/database";

export const metadata = { title: "What to wear" };

/**
 * Dress codes (spec 25 §4).
 *
 * The screen is built around the relationship rather than the text: a code is
 * a name, some labelled guidance, and THE EVENTS THAT WEAR IT. Ticking an
 * event here is what makes the tag appear on the schedule and what fills in
 * the "For Welcome Dinner, Farewell Brunch" line in the attire section — one
 * write, both renderings, no second list to keep in step.
 */
export default async function AttirePage() {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const [codes, { data: events }, { data: boards }] = await Promise.all([
    getDressCodes(wedding.id),
    supabase
      .from("events")
      .select("id, name, dress_code_id")
      .eq("wedding_id", wedding.id)
      .order("sort_order")
      .order("starts_at"),
    supabase
      .from("moodboards")
      .select("id, title")
      .eq("wedding_id", wedding.id)
      .is("archived_at", null)
      .order("sort_order"),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl">What to wear</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            A dress code is a named thing your events point at. Tick the events it covers and it
            shows up on each of them in the schedule, as well as here.{" "}
            <Link href="/site" className="underline">
              Back to the site →
            </Link>
          </p>
        </div>
      </div>

      <AttireEditor
        codes={codes}
        events={(events ?? []) as Pick<EventRow, "id" | "name" | "dress_code_id">[]}
        boards={(boards ?? []) as Pick<MoodboardRow, "id" | "title">[]}
      />
    </div>
  );
}
