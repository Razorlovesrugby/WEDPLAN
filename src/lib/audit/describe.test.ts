import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AUDIT_AREAS,
  actorLabel,
  allAuditedTables,
  columnLabel,
  dayStartInZone,
  describeEntry,
  formatValue,
  nextDay,
  nounFor,
  parseAuditFilters,
} from "./describe";
import type { AuditLogRow } from "@/lib/types/database";

const alex = "aaaaaaaa-0000-4000-8000-000000000001";
const sam = "aaaaaaaa-0000-4000-8000-000000000002";
const people = [
  { user_id: alex, role: "owner", display_name: "Alex" },
  { user_id: sam, role: "partner", display_name: null },
];

function entry(over: Partial<AuditLogRow>): AuditLogRow {
  return {
    id: 1,
    wedding_id: "w",
    at: "2027-01-05T09:00:00+00:00",
    actor_id: alex,
    actor_kind: "planner",
    table_name: "households",
    row_key: { id: "h" },
    label: "Okonkwo",
    action: "update",
    changed: {},
    ...over,
  };
}

describe("actorLabel", () => {
  it("uses a collaborator's typed name, falling back to their role", () => {
    expect(actorLabel(entry({}), people)).toBe("Alex");
    expect(actorLabel(entry({ actor_id: sam }), people)).toBe("Partner");
  });

  it("does not guess when the collaborator is gone", () => {
    expect(actorLabel(entry({ actor_id: "dddddddd-0000-4000-8000-000000000009" }), people)).toBe(
      "A former collaborator",
    );
  });

  it("labels a signed-out write by what it touched", () => {
    const guest = entry({ actor_id: null, actor_kind: "public", table_name: "rsvps" });
    expect(actorLabel(guest, people)).toBe("A guest (via their link)");
    const auto = entry({ actor_id: null, actor_kind: "public", table_name: "budget_items" });
    expect(actorLabel(auto, people)).toBe("An automatic update");
  });
});

describe("describeEntry", () => {
  it("describes an update as old → new, in the wedding's own timezone", () => {
    const d = describeEntry(
      entry({
        table_name: "weddings",
        label: "Sam & Alex",
        changed: { rsvp_lock_at: ["2027-05-01T11:00:00+00:00", "2027-05-08T11:00:00+00:00"] },
      }),
      people,
      "Pacific/Auckland",
    );
    expect(d.who).toBe("Alex");
    expect(d.verb).toBe("changed");
    expect(d.subject).toBe("wedding details “Sam & Alex”");
    expect(d.details).toEqual(["RSVP lock date: 1 May 2027, 23:00 → 8 May 2027, 23:00"]);
  });

  it("never lists bookkeeping columns", () => {
    const d = describeEntry(
      entry({ changed: { display_name: ["A", "B"], updated_at: ["x", "y"], id: ["1", "2"] } }),
      people,
      "UTC",
    );
    expect(d.details).toEqual(["Name: A → B"]);
  });

  it("reads a deleted_at-only change as removed / restored", () => {
    const removed = describeEntry(
      entry({ table_name: "guests", changed: { deleted_at: [null, "2027-01-05T09:00:00+00:00"] } }),
      people,
      "UTC",
    );
    expect(removed.verb).toBe("removed");
    expect(removed.details).toEqual([]);
    const restored = describeEntry(
      entry({ table_name: "guests", changed: { deleted_at: ["2027-01-05T09:00:00+00:00", null] } }),
      people,
      "UTC",
    );
    expect(restored.verb).toBe("restored");
  });

  it("handles inserts, deletes, and rows with no name", () => {
    expect(describeEntry(entry({ action: "insert" }), people, "UTC")).toMatchObject({
      verb: "added",
      subject: "household “Okonkwo”",
    });
    expect(
      describeEntry(entry({ action: "delete", table_name: "guest_tags", label: null }), people, "UTC"),
    ).toMatchObject({ verb: "deleted", subject: "a guest tag" });
    expect(
      describeEntry(entry({ action: "insert", table_name: "invitations", label: null }), people, "UTC")
        .subject,
    ).toBe("an invitation");
  });

  it("shows a redacted value as hidden, never the value", () => {
    const d = describeEntry(
      entry({ table_name: "gift_bank_details", label: null, changed: { account_number: "[redacted]" } }),
      people,
      "UTC",
    );
    // A redacted update has no [old, new] pair, so there is no line to leak anything.
    expect(d.details).toEqual([]);
    expect(formatValue("account_number", "[redacted]", "UTC")).toBe("hidden");
  });
});

describe("formatValue / columnLabel", () => {
  it("formats the common shapes", () => {
    expect(formatValue("x", null, "UTC")).toBe("empty");
    expect(formatValue("x", "", "UTC")).toBe("empty");
    expect(formatValue("x", true, "UTC")).toBe("yes");
    expect(formatValue("x", false, "UTC")).toBe("no");
    expect(formatValue("x", 3, "UTC")).toBe("3");
    expect(formatValue("amount_minor", 12345, "UTC")).toBe("$123.45");
    expect(formatValue("x", "2027-06-12", "UTC")).toBe("12 June 2027");
    expect(formatValue("x", { a: 1 }, "UTC")).toBe("(updated)");
    expect(formatValue("x", "a".repeat(80), "UTC")).toHaveLength(58);
  });

  it("names columns for people", () => {
    expect(columnLabel("sent_at")).toBe("Sent");
    expect(columnLabel("household_id")).toBe("Household");
    expect(columnLabel("unit_price_minor")).toBe("Unit price");
    expect(columnLabel("rsvp_deadline")).toBe("RSVP deadline");
  });
});

describe("parseAuditFilters", () => {
  it("accepts good values", () => {
    expect(
      parseAuditFilters({ area: "budget", actor: alex, from: "2027-01-01", to: "2027-01-31", before: "40" }),
    ).toEqual({ area: "budget", actor: alex, from: "2027-01-01", to: "2027-01-31", before: 40 });
    expect(parseAuditFilters({ actor: "public" }).actor).toBe("public");
  });

  it("drops anything that doesn't parse, so a bad link shows the unfiltered log", () => {
    expect(
      parseAuditFilters({ area: "nope", actor: "not-a-uuid", from: "01/01/2027", to: "2027-13-45", before: "-1" }),
    ).toEqual({ area: null, actor: null, from: null, to: null, before: null });
  });
});

describe("dayStartInZone", () => {
  it("starts the day where the couple are, not in UTC", () => {
    // Auckland is UTC+13 in January (NZDT): its 1 Jan began on 31 Dec UTC.
    expect(dayStartInZone("2027-01-01", "Pacific/Auckland").toISOString()).toBe("2026-12-31T11:00:00.000Z");
    expect(dayStartInZone("2027-01-01", "UTC").toISOString()).toBe("2027-01-01T00:00:00.000Z");
    // London in June is UTC+1.
    expect(dayStartInZone("2027-06-12", "Europe/London").toISOString()).toBe("2027-06-11T23:00:00.000Z");
  });

  it("rolls the end of a range over month and year boundaries", () => {
    expect(nextDay("2027-01-31")).toBe("2027-02-01");
    expect(nextDay("2027-12-31")).toBe("2028-01-01");
  });
});

describe("coverage against the migration", () => {
  const migration = readFileSync(
    new URL("../../../supabase/migrations/0035_audit_log.sql", import.meta.url),
    "utf8",
  );
  const audited = [...migration.matchAll(/^\s+'([a-z_]+)\|[^']*',?$/gm)].map((m) => m[1] as string);

  it("found the audited list in the migration", () => {
    expect(audited.length).toBeGreaterThan(40);
  });

  it("every audited table has a filter area and a name, and no area lists a table that isn't audited", () => {
    const inAreas = new Set(allAuditedTables());
    for (const table of audited) {
      expect(inAreas.has(table), `${table} is audited but in no filter area`).toBe(true);
      expect(nounFor(table), `${table} has no noun`).not.toBe(table.replace(/_/g, " "));
    }
    for (const table of inAreas) {
      expect(audited, `${table} is in a filter area but not audited`).toContain(table);
    }
  });

  it("lists each table in exactly one area", () => {
    const all = AUDIT_AREAS.flatMap((a) => [...a.tables]);
    expect(new Set(all).size).toBe(all.length);
  });
});
