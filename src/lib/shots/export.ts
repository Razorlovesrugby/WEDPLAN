import type { ShotSectionItem } from "./model";

export const SHOTS_CSV_HEADER = ["Section", "Order", "Shot", "Kind", "Must-have", "People", "Minutes", "Note", "Status", "Status at", "Set by"] as const;

/** One row per shot, in the couple's order (spec 52 §6). */
export function shotsCsvRows(sections: readonly ShotSectionItem[]): string[][] {
  return sections.flatMap((section) =>
    section.shots.map((s, i) => [
      section.name,
      String(i + 1),
      s.title,
      s.kind,
      s.mustHave ? "yes" : "",
      s.people.map((p) => p.name).join("; "),
      String(s.minutes),
      s.note ?? "",
      s.status,
      s.statusAt ?? "",
      s.statusBy ?? "",
    ]),
  );
}
