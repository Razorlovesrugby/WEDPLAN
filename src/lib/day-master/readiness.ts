/**
 * The readiness check before the day (spec 55 §7). Pure: a list of lines, each
 * with how many it found and where it is fixed.
 */

export type ReadinessInput = {
  items: { id: string; title: string; assigneeCount: number; handedBack: boolean; openPlaces: number }[];
  /** Helpers with at least one task (not the couple or planner). */
  helpers: { key: string; name: string; hasLink: boolean; opened: boolean; phone: string | null }[];
  tasks: { total: number; confirmed: number };
  questions: number;
  contacts: number;
  infoSections: number;
};

export type ReadinessLine = {
  key: string;
  label: string;
  /** How many things it found; 0 is good, except for `info`. */
  count: number;
  ok: boolean;
  names: string[];
  href: string;
};

export function readiness(input: ReadinessInput): ReadinessLine[] {
  const unassigned = input.items.filter((i) => i.assigneeCount === 0);
  const noLink = input.helpers.filter((h) => !h.hasLink);
  const unopened = input.helpers.filter((h) => h.hasLink && !h.opened);
  const handedBack = input.items.filter((i) => i.handedBack);
  const open = input.items.filter((i) => i.openPlaces > 0);
  const noPhone = input.helpers.filter((h) => !h.phone?.trim());
  const line = (key: string, label: string, names: string[], href: string, okWhen = 0): ReadinessLine => ({
    key,
    label,
    count: names.length,
    ok: names.length <= okWhen,
    names,
    href,
  });
  const unconfirmed = input.tasks.total - input.tasks.confirmed;
  return [
    line("unassigned", "Jobs with nobody assigned", unassigned.map((i) => i.title), "/run-sheet/people"),
    line("no_link", "People without a day link", noLink.map((h) => h.name), "/run-sheet/links"),
    line("unopened", "Links made but never opened", unopened.map((h) => h.name), "/run-sheet/links"),
    {
      key: "confirmed",
      label: `Confirmed ${input.tasks.confirmed} of ${input.tasks.total}`,
      count: unconfirmed,
      ok: unconfirmed === 0,
      names: [],
      href: "/run-sheet/links",
    },
    line("handed_back", "Jobs handed back, needing someone", handedBack.map((i) => i.title), "/run-sheet/links"),
    line("open_places", "Open jobs with places still free", open.map((i) => `${i.title} (${i.openPlaces})`), "/run-sheet/people"),
    { key: "questions", label: "Questions from helpers to answer", count: input.questions, ok: input.questions === 0, names: [], href: "/run-sheet/links" },
    line("no_phone", "Helpers with no phone number", noPhone.map((h) => h.name), "/run-sheet/links"),
    { key: "contacts", label: "Day contacts set", count: input.contacts, ok: input.contacts > 0, names: [], href: "/run-sheet/links" },
    { key: "info", label: "Good to know written", count: input.infoSections, ok: input.infoSections > 0, names: [], href: "/run-sheet/links" },
  ];
}

export function readinessSummary(lines: readonly ReadinessLine[]): { ready: boolean; open: number } {
  const open = lines.filter((l) => !l.ok).length;
  return { ready: open === 0, open };
}
