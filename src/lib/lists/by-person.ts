import { itemAssigneeValue, parseAssignee, type AssigneeColumns } from "@/lib/people";

/**
 * The items handed to one assignee, for the Who filter on the All tasks view
 * (spec 56 §7). `who` is the assign picker's own value: `u:<user id>` for a
 * collaborator, `p:<person id>` for a person. Anything else, including "", is
 * no filter, because the value comes from a browser's address bar.
 */
export function filterByAssignee<T extends AssigneeColumns>(items: readonly T[], who: string | null | undefined): T[] {
  if (parseAssignee(who).kind === "none") return [...items];
  const wanted = who!.toLowerCase();
  return items.filter((item) => itemAssigneeValue(item).toLowerCase() === wanted);
}
