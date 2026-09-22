"use client";

import { useEffect, useRef } from "react";
import { logInvitationView, logSaveTheDateView } from "@/server/actions/views";

/**
 * Records that this household opened their invitation (spec 22 §9).
 *
 * Renders nothing. It exists as a client component on purpose: mail scanners
 * and link previewers fetch every URL in a message but do not run JavaScript,
 * so logging here counts people and not robots.
 *
 * The planner's "preview as them" passes `enabled={false}` — a feature that
 * reports the planner back to themselves is worse than no feature, and the
 * first time it happens it is actively misleading.
 */
export function ViewLogger({
  token,
  enabled,
  source = "address",
}: {
  token: string;
  enabled: boolean;
  source?: "address" | "token" | "email";
}) {
  const logged = useRef(false);

  useEffect(() => {
    if (!enabled || logged.current) return;
    logged.current = true;
    void logInvitationView({ token, source });
  }, [token, enabled, source]);

  return null;
}

/**
 * The same, for the save-the-date page (0031). Keyed by the household's
 * address because a save-the-date usually goes out before any invitation
 * token exists.
 */
export function SaveTheDateViewLogger({
  weddingSlug,
  address,
  enabled,
}: {
  weddingSlug: string;
  address: string;
  enabled: boolean;
}) {
  const logged = useRef(false);

  useEffect(() => {
    if (!enabled || logged.current) return;
    logged.current = true;
    void logSaveTheDateView({ weddingSlug, address });
  }, [weddingSlug, address, enabled]);

  return null;
}
