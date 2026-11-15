import { redirect } from "next/navigation";

/** The run sheet is one list for the whole wedding (spec 50); old per-event links land there. */
export default function EventRunSheetRedirect() {
  redirect("/run-sheet");
}
