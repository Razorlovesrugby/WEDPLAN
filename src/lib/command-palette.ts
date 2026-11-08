import { navGroupsFor, type Viewer } from "./nav-groups";
import { DESIGN_TABS, GUESTS_TABS, REGISTRY_TABS, TASKS_TABS } from "./nav-tabs";

/**
 * ⌘K (spec 46): go anywhere, find anything, make something. Pure, so the
 * ranking and the planner filter are tested rather than trusted to a dialog.
 */

export type CommandGroup = "go" | "find" | "make";
export const GROUP_LABEL: Record<CommandGroup, string> = { go: "Go to", find: "Find", make: "Make" };
const GROUP_ORDER: CommandGroup[] = ["go", "find", "make"];

/** A command either navigates (`href`) or runs a named action the dialog knows how to do. */
export type Command = {
  id: string;
  group: CommandGroup;
  label: string;
  /** Small grey text: the section, or what kind of thing it is. */
  hint?: string;
  href?: string;
  action?: { kind: "add-task"; listId: string; title: string } | { kind: "add-vendor"; name: string } | { kind: "add-moodboard"; title: string };
  /** Extra words it answers to, e.g. "preferences" for Settings. */
  keywords?: string[];
};

export const PER_GROUP = 8;

/** Every screen and sub-view, from the same lists as the sidebar and the tabs, so ⌘K can't drift from them. */
export function goCommands(viewer: Viewer): Command[] {
  const commands: Command[] = [];
  const allowed = new Set<string>();
  for (const group of navGroupsFor(viewer)) {
    for (const entry of group.entries) {
      allowed.add(entry.href);
      commands.push({ id: `go:${entry.href}`, group: "go", label: entry.label, hint: group.label ?? undefined, href: entry.href });
    }
  }
  const subViews: [string, readonly { href: string; label: string }[]][] = [
    ["Tasks", TASKS_TABS],
    ["Guest list", GUESTS_TABS],
    ["Design", DESIGN_TABS],
    ["Registry", REGISTRY_TABS],
  ];
  for (const [section, tabs] of subViews) {
    for (const tab of tabs) {
      // A sub-view is offered only when its section is: a planner gets no Design or Registry.
      const owner = navGroupsFor(viewer)
        .flatMap((group) => group.entries)
        .find((entry) => entry.label === section);
      if (!owner || commands.some((command) => command.href === tab.href)) continue;
      commands.push({ id: `go:${tab.href}`, group: "go", label: tab.label, hint: section, href: tab.href });
    }
  }
  if (allowed.has("/settings")) {
    commands.push(
      { id: "go:/settings#account", group: "go", label: "Your account", hint: "Settings", href: "/settings#account", keywords: ["password", "partner"] },
      { id: "go:/settings/activity", group: "go", label: "Activity", hint: "Settings", href: "/settings/activity", keywords: ["audit", "history"] },
    );
    const settings = commands.find((command) => command.href === "/settings");
    if (settings) settings.keywords = ["preferences", "timezone", "currency"];
  }
  return commands;
}

/** "Make" commands. With text typed, the ones that can take a name use it directly. */
export function makeCommands(
  viewer: Viewer,
  query: string,
  lists: { id: string; title: string }[],
): Command[] {
  const text = query.trim();
  const commands: Command[] = [];
  if (text) {
    for (const list of lists.slice(0, 5)) {
      commands.push({
        id: `make:task:${list.id}`,
        group: "make",
        label: `Add “${text}” to ${list.title}`,
        hint: "Task",
        action: { kind: "add-task", listId: list.id, title: text },
      });
    }
    commands.push({ id: "make:vendor:named", group: "make", label: `Add vendor “${text}”`, hint: "Vendor", action: { kind: "add-vendor", name: text } });
    if (viewer === "couple") {
      commands.push({ id: "make:moodboard:named", group: "make", label: `New moodboard “${text}”`, hint: "Moodboard", action: { kind: "add-moodboard", title: text } });
    }
  }
  // Without a name, each opens its own add form. These always match "new …".
  const forms: Command[] = [
    { id: "make:task", group: "make", label: "New task", href: "/lists", keywords: ["new", "add", "todo"] },
    { id: "make:household", group: "make", label: "New household", href: "/households/new", keywords: ["new", "add", "guest"] },
    { id: "make:vendor", group: "make", label: "New vendor", href: "/vendors", keywords: ["new", "add", "supplier"] },
    { id: "make:budget", group: "make", label: "New budget line", href: "/budget", keywords: ["new", "add", "cost"] },
    { id: "make:moodboard", group: "make", label: "New moodboard", href: "/moodboards", keywords: ["new", "add", "board"] },
    { id: "make:event", group: "make", label: "New event", href: "/events", keywords: ["new", "add", "ceremony", "reception"] },
  ];
  // A planner can't create guests (view-only, spec 39), budget lines or moodboards.
  const plannerForms = new Set(["make:task", "make:vendor", "make:event"]);
  return [...commands, ...forms.filter((command) => viewer === "couple" || plannerForms.has(command.id))];
}

function normalise(value: string): string {
  return value.toLocaleLowerCase("en-NZ").normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/**
 * How well a command matches: 3 = the label starts with the query, 2 = a word
 * in it does, 1 = it's somewhere in the label, hint or keywords, 0 = no match.
 * Typed "Make" commands built from the query always match.
 */
export function matchScore(command: Command, query: string): number {
  const q = normalise(query.trim());
  if (!q) return 1;
  if (command.action) return 1;
  const label = normalise(command.label);
  if (label.startsWith(q)) return 3;
  if (label.split(/[\s&·,/-]+/).some((word) => word.startsWith(q))) return 2;
  const extra = normalise([command.hint ?? "", ...(command.keywords ?? [])].join(" "));
  return label.includes(q) || extra.split(/\s+/).some((word) => word.startsWith(q)) ? 1 : 0;
}

/** Filter and order: Go to, then Find, then Make; within each, best match first; at most PER_GROUP each. */
export function rankCommands(commands: readonly Command[], query: string): { group: CommandGroup; commands: Command[] }[] {
  const empty = query.trim() === "";
  return GROUP_ORDER.map((group) => {
    const scored = commands
      .filter((command) => command.group === group)
      .map((command, index) => ({ command, index, score: matchScore(command, query) }))
      .filter((entry) => entry.score > 0)
      // With nothing typed, Find is empty (it needs a query) and the rest keep their order.
      .filter((entry) => !(empty && group === "find"))
      .sort((a, b) => b.score - a.score || a.index - b.index);
    return { group, commands: scored.slice(0, PER_GROUP).map((entry) => entry.command) };
  }).filter((section) => section.commands.length > 0);
}

/** Escape a user's text for a PostgREST `ilike` pattern inside an `or=(…)` filter. */
export function ilikePattern(query: string): string {
  const cleaned = query
    .slice(0, 80)
    .replace(/[\\%_]/g, (character) => `\\${character}`)
    .replace(/[,()"]/g, " ")
    .trim();
  return `%${cleaned}%`;
}
