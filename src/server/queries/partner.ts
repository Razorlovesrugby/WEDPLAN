import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CollaboratorRow } from "@/lib/types/database";

/**
 * The other collaborator's login, for Settings → Your account (spec 40 §5.4).
 *
 * The collaborator rows come from the caller (read through RLS, so they are
 * already this wedding's); the service role is used only to read the one
 * auth user each row points at, because `auth.users` isn't readable from a
 * session. Nothing here takes an id from the client.
 */
export type PartnerAccount = {
  collaboratorId: string;
  name: string | null;
  email: string | null;
  /** False until they have used their invite link and signed in once. */
  joined: boolean;
};

export const getPartnerAccount = cache(
  async (collaborators: readonly CollaboratorRow[], currentUserId: string): Promise<PartnerAccount | null> => {
    const other = collaborators.find((c) => c.user_id !== currentUserId);
    if (!other) return null;
    const { data } = await createAdminClient().auth.admin.getUserById(other.user_id);
    return {
      collaboratorId: other.id,
      name: other.display_name,
      email: data.user?.email ?? null,
      joined: Boolean(data.user?.last_sign_in_at),
    };
  },
);
