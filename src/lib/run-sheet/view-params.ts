/**
 * What the run sheet's address says about how to show it (spec 56 §6.2). Every
 * view is a URL, so Back, bookmarks, ⌘K and the links on other screens all land
 * on the same view. Pure: the value comes from a browser, so anything
 * unrecognised reads as "not set" rather than throwing.
 */

/** The run sheet's Show filter value for jobs nobody is on. */
export const UNASSIGNED_WHO = "unassigned";

export type RunSheetParams = {
  /** By the hour is the default; `?view=list` is the flat list. */
  view: "hours" | "list";
  /** An assignee key (`type:id`), `unassigned`, or "" for everyone. */
  who: string;
  /** Show only this event's jobs, or null for all of them. */
  event: string | null;
};

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const WHO = new RegExp(`^(collaborator|guest|vendor|person):${UUID}$`, "i");
const EVENT = new RegExp(`^${UUID}$`, "i");

export function parseRunSheetParams(raw: { view?: string; who?: string; event?: string }): RunSheetParams {
  const who = raw.who ?? "";
  return {
    view: raw.view === "list" ? "list" : "hours",
    who: who === UNASSIGNED_WHO || WHO.test(who) ? who : "",
    event: raw.event && EVENT.test(raw.event) ? raw.event : null,
  };
}

/** The address for a path with these params; defaults are left out so addresses stay short. */
export function runSheetHref(path: string, params: Partial<RunSheetParams>): string {
  const query = new URLSearchParams();
  if (params.view === "list") query.set("view", "list");
  if (params.who) query.set("who", params.who);
  if (params.event) query.set("event", params.event);
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
