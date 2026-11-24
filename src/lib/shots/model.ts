import type { ShotKind, ShotStatus } from "@/lib/types/database";

/** One shot as the screens hold it, with its people resolved to names. */
export type ShotPerson =
  | { key: string; kind: "guest"; id: string; name: string }
  | { key: string; kind: "person"; id: string; name: string }
  | { key: string; kind: "role"; role: string; name: string };

export type ShotItem = {
  id: string;
  sectionId: string;
  title: string;
  kind: ShotKind;
  mustHave: boolean;
  minutes: number;
  note: string | null;
  shooter: "lead" | "second" | null;
  referenceUrl: string | null;
  sortOrder: number;
  status: ShotStatus;
  statusAt: string | null;
  statusBy: string | null;
  people: ShotPerson[];
};

export type ShotSectionItem = {
  id: string;
  name: string;
  location: string | null;
  runSheetItemId: string | null;
  /** From the linked run sheet item, when there is one. */
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
  shots: ShotItem[];
};

export const DEFAULT_SECTIONS = ["Getting ready", "Ceremony", "Family formals", "Couple portraits", "Reception", "Details"] as const;

export const personKey = (kind: "guest" | "person" | "role", idOrRole: string) => `${kind}:${idOrRole}`;

export const DEFAULT_MINUTES: Record<ShotKind, number> = { group: 2, moment: 0, detail: 0, portrait: 0 };

export const KIND_LABEL: Record<ShotKind, string> = { group: "Group", moment: "Moment", detail: "Detail", portrait: "Portrait" };
