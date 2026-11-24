/**
 * Modules: front ends for one job, plugged into a day link (spec 54 §7).
 *
 * A module is code, not data. Adding one adds code and no migration, the way
 * site block kinds do. The registry is the only place the app learns that a
 * module exists, and a stored module key it doesn't know is ignored.
 *
 * Specs 52 (shot list) and 53 Part I (seating) register theirs here; until
 * they are built the registry is empty and a link has no tabs beyond My day.
 */

export type ModuleAssignee =
  | { type: "vendor"; categoryName: string | null }
  | { type: "guest" }
  | { type: "person" };

export type DayModule = {
  /** `^[a-z_]{1,40}$`, also the stored key. */
  key: string;
  label: string;
  /** Who the couple may switch it on for. */
  offeredTo: (assignee: ModuleAssignee) => boolean;
  /** Who gets it without the couple choosing, so they rarely have to. */
  onByDefaultFor: (assignee: ModuleAssignee, context: { linkedItemOpensModule: boolean }) => boolean;
  /** Tabs it adds to the bar (My day is always first; at most four tabs in all). */
  tabs: { key: string; label: string }[];
  /** A one-line summary for spec 55's master, or null. */
  masterSummary?: (linkId: string) => Promise<string | null>;
};

export const MODULE_KEY = /^[a-z_]{1,40}$/;
export const MAX_TABS = 5;

/** Spec 52: the photographer's front end. On for photography and video vendors, and for anyone whose task opens it (scoped to that section). */
const shotList: DayModule = {
  key: "shot_list",
  label: "Shot list",
  offeredTo: () => true,
  onByDefaultFor: (assignee, context) =>
    (assignee.type === "vendor" && /photograph|video/i.test(assignee.categoryName ?? "")) || context.linkedItemOpensModule,
  tabs: [
    { key: "shot_now", label: "Now" },
    { key: "shot_all", label: "All shots" },
    { key: "shot_faces", label: "Faces" },
  ],
};

/** Spec 53 Part I: find a seat, mark arrivals, move a guest, seat a walk-in. On for venue and catering vendors. */
const seating: DayModule = {
  key: "seating",
  label: "Seating",
  offeredTo: () => true,
  onByDefaultFor: (assignee) => assignee.type === "vendor" && /venue|cater/i.test(assignee.categoryName ?? ""),
  tabs: [{ key: "seat_find", label: "Seating" }],
};

/** The registry. */
export const DAY_MODULES: readonly DayModule[] = [shotList, seating];

export function moduleByKey(key: string, registry: readonly DayModule[] = DAY_MODULES): DayModule | null {
  return registry.find((m) => m.key === key) ?? null;
}

/** The registered modules among a link's stored keys, in the link's order. Unknown keys are ignored. */
export function activeModules(keys: readonly string[], registry: readonly DayModule[] = DAY_MODULES): DayModule[] {
  return keys.flatMap((key) => {
    const found = MODULE_KEY.test(key) ? moduleByKey(key, registry) : null;
    return found ? [found] : [];
  });
}

/** What the couple can switch on for someone. */
export function offeredModules(assignee: ModuleAssignee, registry: readonly DayModule[] = DAY_MODULES): DayModule[] {
  return registry.filter((m) => m.offeredTo(assignee));
}

/** The keys a new link starts with. */
export function defaultModuleKeys(
  assignee: ModuleAssignee,
  context: { linkedItemOpensModule: boolean },
  registry: readonly DayModule[] = DAY_MODULES,
): string[] {
  return registry.filter((m) => m.offeredTo(assignee) && m.onByDefaultFor(assignee, context)).map((m) => m.key);
}

/** The tab bar: My day first, then each module's tabs, at most five (the shot list has three, seating one). */
export function tabBar(modules: readonly DayModule[]): { key: string; label: string }[] {
  const tabs = modules.flatMap((m) => m.tabs);
  if (tabs.length === 0) return [];
  return [{ key: "my_day", label: "My day" }, ...tabs].slice(0, MAX_TABS);
}
