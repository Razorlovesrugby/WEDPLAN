import Link from "next/link";
import {
  invitationState,
  saveTheDateState,
  type InvitationState,
  type JourneyRow,
  type SaveTheDateState,
  type Stage,
} from "@/lib/invitations/journey";

const STD_CELL: Record<SaveTheDateState, { mark: string; label: string }> = {
  none: { mark: "·", label: "Not sent" },
  sent: { mark: "✓", label: "Sent" },
  opened: { mark: "◉", label: "Opened" },
};

const INVITE_CELL: Record<InvitationState, { mark: string; label: string }> = {
  none: { mark: "·", label: "No invitation yet" },
  ready: { mark: "○", label: "Ready, not sent" },
  sent: { mark: "✓", label: "Sent" },
  opened: { mark: "◉", label: "Opened" },
  replied: { mark: "✓✓", label: "Replied" },
  unable: { mark: "✕", label: "Can't come" },
};

/**
 * Track (spec 42 §5.4): one row per household, with where it is on both
 * stages. The current stage's cell is the wider one. Each mark has its words
 * beside it, so it never relies on the symbol alone.
 */
export function JourneyTable({
  rows,
  stage,
}: {
  rows: (JourneyRow & { household: { id: string; display_name: string } })[];
  stage: Stage;
}) {
  if (rows.length === 0) {
    return <p className="card p-6 text-center text-sm text-muted">No households match.</p>;
  }
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="px-3 py-2">Household</th>
            <th scope="col" className={`px-3 py-2 ${stage === "save-the-date" ? "w-2/5" : ""}`}>Save the date</th>
            <th scope="col" className={`px-3 py-2 ${stage === "invitation" ? "w-2/5" : ""}`}>Invitation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => {
            const std = STD_CELL[saveTheDateState(row)];
            const invite = INVITE_CELL[invitationState(row)];
            return (
              <tr key={row.household.id}>
                <td className="px-3 py-2">
                  <Link href={`/households/${row.household.id}`} className="hover:underline">
                    {row.household.display_name}
                  </Link>
                </td>
                <td className={`px-3 py-2 ${stage === "save-the-date" ? "font-medium" : "text-muted"}`}>
                  <span aria-hidden className="inline-block w-6">{std.mark}</span>
                  {std.label}
                </td>
                <td className={`px-3 py-2 ${stage === "invitation" ? "font-medium" : "text-muted"}`}>
                  <span aria-hidden className="inline-block w-6">{invite.mark}</span>
                  {invite.label}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
