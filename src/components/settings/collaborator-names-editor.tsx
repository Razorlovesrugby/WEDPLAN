"use client";

import { useRouter } from "next/navigation";
import { updateCollaboratorName } from "@/server/actions/settings";
import { InlineText } from "@/components/guests/inline-text";
import type { CollaboratorRow } from "@/lib/types/database";

/**
 * A typed name for each collaborator (spec 15 §2) — the assign picker and
 * every place an assignee renders fall back to the role label ("Owner" /
 * "Partner") until this is set. Either collaborator can edit either name,
 * the same shared-edit shape list titles and section names already use.
 */
export function CollaboratorNamesEditor({ collaborators }: { collaborators: CollaboratorRow[] }) {
  if (collaborators.length === 0) {
    return <p className="text-sm text-muted">No collaborators yet.</p>;
  }

  return (
    <ul className="card divide-y divide-line">
      {collaborators.map((c) => (
        <CollaboratorNameRow key={c.id} collaborator={c} />
      ))}
    </ul>
  );
}

function CollaboratorNameRow({ collaborator }: { collaborator: CollaboratorRow }) {
  const router = useRouter();

  async function saveName(next: string) {
    const result = await updateCollaboratorName(collaborator.id, next);
    if (result.ok) router.refresh();
    return result;
  }

  return (
    <li className="flex items-center gap-3 p-3">
      <span className="w-20 shrink-0 text-xs uppercase tracking-wide text-muted">
        {collaborator.role === "owner" ? "Owner" : "Partner"}
      </span>
      <span className="min-w-0 flex-1">
        <InlineText
          value={collaborator.display_name}
          placeholder="Add a name"
          ariaLabel={`Name for the ${collaborator.role}`}
          onSave={saveName}
          className="text-sm"
        />
      </span>
    </li>
  );
}
