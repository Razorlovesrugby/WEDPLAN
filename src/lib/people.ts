/**
 * Who a task is handed to (spec 39). Pure — the one place the label rules live,
 * so the assign picker, the row chip, the tasks CSV and the activity page can't
 * drift apart (they used to each carry their own "You / Owner / Partner").
 *
 * A task is assigned to a collaborator (`assigned_to`, a login) OR to a person
 * (`assigned_person_id`, who may have no login), never both — the database
 * enforces it (0043). The picker speaks one string: "" for nobody,
 * `u:<user id>` for a collaborator, `p:<person id>` for a person.
 */

export type AssigneeCollaborator = {
  user_id: string;
  role: "owner" | "partner";
  display_name: string | null;
};

export type AssigneePerson = {
  id: string;
  name: string;
  deleted_at?: string | null;
};

export type Assignee =
  | { kind: "none" }
  | { kind: "user"; id: string }
  | { kind: "person"; id: string };

export type AssigneeColumns = {
  assigned_to: string | null;
  assigned_person_id: string | null;
};

export function encodeAssignee(assignee: Assignee): string {
  if (assignee.kind === "user") return `u:${assignee.id}`;
  if (assignee.kind === "person") return `p:${assignee.id}`;
  return "";
}

/** Anything unrecognised reads as "nobody" rather than throwing — the value comes from a browser. */
export function parseAssignee(value: string | null | undefined): Assignee {
  if (!value) return { kind: "none" };
  const match = /^([up]):([0-9a-f-]{36})$/i.exec(value);
  const id = match?.[2];
  if (!match || !id) return { kind: "none" };
  return match[1]?.toLowerCase() === "u" ? { kind: "user", id } : { kind: "person", id };
}

/** The picker value for a row's two columns. If both are somehow set, the collaborator wins (the older column). */
export function itemAssigneeValue(item: AssigneeColumns): string {
  if (item.assigned_to) return encodeAssignee({ kind: "user", id: item.assigned_to });
  if (item.assigned_person_id) return encodeAssignee({ kind: "person", id: item.assigned_person_id });
  return "";
}

/** The two columns to write for a picker value — exactly one, or neither. */
export function assigneeColumns(assignee: Assignee): AssigneeColumns {
  return {
    assigned_to: assignee.kind === "user" ? assignee.id : null,
    assigned_person_id: assignee.kind === "person" ? assignee.id : null,
  };
}

/** A collaborator's label: their typed name, else "You" for the signed-in user, else the role. */
export function collaboratorLabel(c: AssigneeCollaborator, currentUserId?: string): string {
  return c.display_name?.trim() || (c.user_id === currentUserId ? "You" : c.role === "owner" ? "Owner" : "Partner");
}

export type AssigneeOption = { value: string; label: string };

/**
 * The picker's options: collaborators first (as before), then people. A removed
 * person is offered only while a task still holds them, so the select never
 * shows a blank for a real assignment.
 */
export function assigneeOptions(
  collaborators: readonly AssigneeCollaborator[],
  people: readonly AssigneePerson[],
  currentUserId?: string,
  selectedValue = "",
): AssigneeOption[] {
  const options: AssigneeOption[] = collaborators.map((c) => ({
    value: encodeAssignee({ kind: "user", id: c.user_id }),
    label: collaboratorLabel(c, currentUserId),
  }));
  for (const person of people) {
    const value = encodeAssignee({ kind: "person", id: person.id });
    if (person.deleted_at && value !== selectedValue) continue;
    options.push({ value, label: person.deleted_at ? `${person.name} (removed)` : person.name });
  }
  return options;
}

/** "Owner" / "Ray" / "Pat" for a row, or null when unassigned or unknown. */
export function assigneeLabel(
  item: AssigneeColumns,
  collaborators: readonly AssigneeCollaborator[],
  people: readonly AssigneePerson[],
  currentUserId?: string,
): string | null {
  if (item.assigned_to) {
    const c = collaborators.find((x) => x.user_id === item.assigned_to);
    return c ? collaboratorLabel(c, currentUserId) : null;
  }
  if (item.assigned_person_id) {
    const p = people.find((x) => x.id === item.assigned_person_id);
    return p ? p.name : null;
  }
  return null;
}

/** A person's name, trimmed, 1–80 characters; null if it isn't one. */
export function cleanPersonName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= 80 ? name : null;
}

/** The people row that is this signed-in user (a planner), for "Assigned to me". */
export function personIdForUser(
  people: readonly { id: string; user_id: string | null; deleted_at?: string | null }[],
  userId: string | undefined,
): string | null {
  if (!userId) return null;
  return people.find((p) => p.user_id === userId && !p.deleted_at)?.id ?? null;
}
