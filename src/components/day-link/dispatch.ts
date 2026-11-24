import {
  acknowledgeAnnouncement,
  addDayNote,
  claimOpenTask,
  confirmTasks,
  handBack,
  markArrived,
  reportLate,
  requestDayPhotoUpload,
  requestHelp,
  setTaskState,
  tickStep,
} from "@/server/actions/day-link-taps";
import { UPLOAD_CACHE_CONTROL } from "@/lib/storage-cache";
import type { QueuedOp, SendOutcome } from "@/lib/day-links/offline-queue";
import { dropPhoto, takePhoto } from "./photo-store";

type Result = { ok: boolean; error?: string };

/** The day-link actions the queue may replay, by name. Each takes the token first, then its queued args. */
const ACTIONS: Record<string, (token: string, ...args: never[]) => Promise<Result>> = {
  setTaskState: setTaskState as never,
  reportLate: reportLate as never,
  requestHelp: requestHelp as never,
  handBack: handBack as never,
  addDayNote: addDayNote as never,
  tickStep: tickStep as never,
  confirmTasks: confirmTasks as never,
  markArrived: markArrived as never,
  claimOpenTask: claimOpenTask as never,
  acknowledgeAnnouncement: acknowledgeAnnouncement as never,
};

/** Sends a stored photo, then returns the path to put in the tap. Null when the bytes are gone. */
async function uploadStored(token: string, key: string): Promise<{ path: string } | { error: string } | "offline"> {
  const blob = await takePhoto(key).catch(() => null);
  if (!blob) return { error: "A photo couldn't be found on this phone." };
  let slot;
  try {
    slot = await requestDayPhotoUpload(token, blob.type || "image/jpeg", blob.size);
  } catch {
    return "offline";
  }
  if (!slot.ok) return { error: slot.error };
  try {
    const put = await fetch(slot.data.uploadUrl, {
      method: "PUT",
      headers: { "content-type": blob.type || "image/jpeg", "cache-control": UPLOAD_CACHE_CONTROL },
      body: blob,
    });
    if (!put.ok) return "offline";
  } catch {
    return "offline";
  }
  return { path: slot.data.path };
}

/**
 * Runs one tap. "offline" means the network (or a server error) stopped it, so
 * the queue keeps it; a rejected one is a rule saying no and is reported.
 */
export async function sendOp(token: string, op: QueuedOp): Promise<SendOutcome> {
  const action = ACTIONS[op.name];
  if (!action) return { kind: "rejected", error: "Unknown action" };

  const args = [...op.args];
  const stored = args.findIndex((a) => typeof a === "string" && a.startsWith("idb:"));
  let storedKey: string | null = null;
  if (stored >= 0) {
    storedKey = args[stored] as string;
    const uploaded = await uploadStored(token, storedKey);
    if (uploaded === "offline") return { kind: "offline" };
    // Without its photo the tap still goes: a photo is never required.
    args[stored] = "error" in uploaded ? null : uploaded.path;
  }

  try {
    const result = await (action as (token: string, ...a: unknown[]) => Promise<Result>)(token, ...args);
    if (storedKey) await dropPhoto(storedKey).catch(() => undefined);
    return result.ok ? { kind: "sent" } : { kind: "rejected", error: result.error ?? "That didn't go through." };
  } catch {
    return { kind: "offline" };
  }
}
