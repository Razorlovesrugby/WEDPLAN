import { requireWedding } from "@/server/queries/wedding";
import { getRegistryClaims, getRegistrySettings } from "@/server/queries/registry";
import { formatDateTime } from "@/lib/format";
import { ClaimsTable } from "@/components/registry/claims-table";

export const metadata = { title: "Registry · Claims" };

export default async function RegistryClaimsPage() {
  const wedding = await requireWedding();
  const [claims, settings] = await Promise.all([getRegistryClaims(wedding.id), getRegistrySettings(wedding.id)]);
  const since = settings.last_viewed_claims_at;

  // Dates are formatted here, on the server, in the wedding's own timezone.
  // Never inside the client component: Node's and Chromium's Intl differ and a
  // formatted date in a hydrated tree is a hydration mismatch (HANDOFF s41).
  const rows = claims.map((claim) => ({
    ...claim,
    when: formatDateTime(claim.created_at, wedding.timezone),
    isNew: claim.released_at === null && (!since || claim.created_at > since),
  }));

  return <ClaimsTable claims={rows} />;
}
