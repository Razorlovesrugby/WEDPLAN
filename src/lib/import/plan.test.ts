import { describe, expect, it } from "vitest";
import { buildPlan, householdsToCreate, type ExistingGuest } from "./plan";
import type { ColumnMapping } from "./columns";
import { similarity, trigrams } from "./trigram";

const MAPPING: ColumnMapping = ["household", "first_name", "last_name", "email"];

function existing(overrides: Partial<ExistingGuest> = {}): ExistingGuest {
  return {
    id: "guest-1",
    first_name: "Ama",
    last_name: "Boateng",
    email: "ama@example.test",
    household_id: "hh-1",
    household_name: "Ama and Kofi",
    ...overrides,
  };
}

describe("trigram similarity", () => {
  it("pads words so short names still have trigrams", () => {
    expect(trigrams("cat")).toEqual(new Set(["  c", " ca", "cat", "at "]));
  });

  it("scores an exact match as 1", () => {
    expect(similarity("Ama Boateng", "ama boateng")).toBe(1);
  });

  it("scores unrelated names near 0", () => {
    expect(similarity("Ama Boateng", "Xiulan Zhou")).toBeLessThan(0.1);
  });

  it("scores a near-miss above a stranger", () => {
    const typo = similarity("Jon Okafor", "John Okafor");
    const stranger = similarity("Jon Okafor", "Priya Raman");
    expect(typo).toBeGreaterThan(stranger);
    expect(typo).toBeGreaterThan(0.55);
  });

  it("gives two empty strings 0, not 1", () => {
    // Otherwise every unnamed row is a duplicate of every other unnamed row.
    expect(similarity("", "")).toBe(0);
  });
});

describe("buildPlan", () => {
  it("plans a clean file", () => {
    const plan = buildPlan(
      [
        ["The Boatengs", "Ama", "Boateng", "ama@example.test"],
        ["The Boatengs", "Kofi", "Boateng", "kofi@example.test"],
      ],
      MAPPING,
      [],
      [],
    );

    expect(plan.counts.creating).toBe(2);
    expect(plan.counts.invalid).toBe(0);
    expect(plan.rows[0]!.action).toBe("create");
    expect(plan.rows[0]!.guest.email).toBe("ama@example.test");
  });

  it("groups rows sharing a household name into one household", () => {
    const plan = buildPlan(
      [
        ["The Boatengs", "Ama", "Boateng", ""],
        ["the  boatengs ", "Kofi", "Boateng", ""],
      ],
      MAPPING,
      [],
      [],
    );

    expect(plan.rows[0]!.householdKey).toBe(plan.rows[1]!.householdKey);
    expect(plan.newHouseholds).toHaveLength(1);
  });

  it("gives each row its own household when the column is unmapped", () => {
    const plan = buildPlan(
      [
        ["", "Sam", "Achebe", ""],
        ["", "Sam", "Rivera", ""],
      ],
      [null, "first_name", "last_name", "email"],
      [],
      [],
    );

    expect(plan.rows[0]!.householdKey).not.toBe(plan.rows[1]!.householdKey);
    expect(plan.newHouseholds).toHaveLength(2);
  });

  it("joins an existing household rather than creating a second one", () => {
    const plan = buildPlan(
      [["Ama and Kofi", "Yaa", "Boateng", ""]],
      MAPPING,
      [],
      [{ id: "hh-1", display_name: "Ama and Kofi" }],
    );

    expect(plan.rows[0]!.existingHouseholdId).toBe("hh-1");
    expect(plan.newHouseholds).toHaveLength(0);
  });

  it("flags an exact email match against the database and defaults to skip", () => {
    const plan = buildPlan(
      [["The Boatengs", "Amma", "Boateng", "AMA@example.test"]],
      MAPPING,
      [existing()],
      [],
    );

    expect(plan.rows[0]!.duplicate).toMatchObject({
      kind: "email",
      existingGuestId: "guest-1",
      existingName: "Ama Boateng",
    });
    expect(plan.rows[0]!.action).toBe("skip");
  });

  it("flags a fuzzy name match and reports what it matched", () => {
    const plan = buildPlan(
      [["", "Katherine", "Fitzgerald", ""]],
      MAPPING,
      [existing({ id: "g2", first_name: "Kathryn", last_name: "Fitzgerald", email: null })],
      [],
    );

    const duplicate = plan.rows[0]!.duplicate;
    expect(duplicate?.kind).toBe("name");
    expect(duplicate?.existingName).toBe("Kathryn Fitzgerald");
    expect(duplicate?.score).toBeGreaterThan(0.55);
    expect(plan.rows[0]!.action).toBe("skip");
  });

  it("does not flag two genuinely different people who share a surname", () => {
    const plan = buildPlan(
      [["", "Chidi", "Okonkwo", ""]],
      MAPPING,
      [existing({ id: "g3", first_name: "Ngozi", last_name: "Okonkwo", email: null })],
      [],
    );

    expect(plan.rows[0]!.duplicate).toBeNull();
    expect(plan.rows[0]!.action).toBe("create");
  });

  it("catches a file that duplicates itself", () => {
    const plan = buildPlan(
      [
        ["A", "Ama", "Boateng", "ama@example.test"],
        ["B", "Ama", "Boateng", "ama@example.test"],
      ],
      MAPPING,
      [],
      [],
    );

    expect(plan.rows[0]!.duplicate).toBeNull();
    expect(plan.rows[1]!.duplicate?.kind).toBe("duplicate_in_file");
  });

  it("rejects a row with no first name instead of importing a blank guest", () => {
    const plan = buildPlan([["The Boatengs", "", "Boateng", ""]], MAPPING, [], []);

    expect(plan.rows[0]!.errors).toHaveLength(1);
    expect(plan.counts.invalid).toBe(1);
    expect(plan.counts.creating).toBe(0);
  });

  it("rejects every row when no column is mapped to a first name", () => {
    const plan = buildPlan([["The Boatengs", "Ama", "Boateng", ""]], [null, null, null, null], [], []);
    expect(plan.rows[0]!.errors[0]).toMatch(/first name/i);
  });

  it("drops an unusable email with a warning rather than failing the row", () => {
    const plan = buildPlan([["", "Ama", "Boateng", "not an email"]], MAPPING, [], []);

    expect(plan.rows[0]!.guest.email).toBeNull();
    expect(plan.rows[0]!.warnings[0]).toMatch(/not a valid email/i);
    expect(plan.rows[0]!.action).toBe("create");
  });

  it("warns about a short row but still imports it", () => {
    const plan = buildPlan([["The Boatengs", "Ama"]], MAPPING, [], []);

    expect(plan.rows[0]!.warnings[0]).toMatch(/2 of 4 columns/);
    expect(plan.rows[0]!.action).toBe("create");
  });

  it("splits a single name column and keeps an explicit surname column winning", () => {
    const plan = buildPlan(
      [["", "Ama Boateng", "Mensah", ""]],
      MAPPING,
      [],
      [],
    );

    expect(plan.rows[0]!.guest.first_name).toBe("Ama");
    expect(plan.rows[0]!.guest.last_name).toBe("Mensah");
  });

  it("numbers rows the way a spreadsheet does, with the header as line 1", () => {
    const plan = buildPlan([["", "Ama", "", ""]], MAPPING, [], []);
    expect(plan.rows[0]!.line).toBe(2);
  });
});

describe("householdsToCreate", () => {
  it("drops a household whose only guest was switched to skip", () => {
    const plan = buildPlan(
      [
        ["The Boatengs", "Ama", "Boateng", ""],
        ["The Mensahs", "Kofi", "Mensah", ""],
      ],
      MAPPING,
      [],
      [],
    );

    const rows = plan.rows.map((row, i) => (i === 1 ? { ...row, action: "skip" as const } : row));
    const households = householdsToCreate(plan, rows);

    expect(households).toHaveLength(1);
    expect(households[0]!.displayName).toBe("The Boatengs");
  });

  it("still creates a household whose first row was unusable", () => {
    // The household is registered from the bad row, so the good row below it
    // has something to join. Without that, the commit aborts on an orphan.
    const plan = buildPlan(
      [
        ["The Boatengs", "", "Boateng", ""],
        ["The Boatengs", "Kofi", "Boateng", ""],
      ],
      MAPPING,
      [],
      [],
    );

    expect(plan.rows[0]!.errors).toHaveLength(1);
    expect(plan.rows[1]!.action).toBe("create");

    const households = householdsToCreate(plan, plan.rows);
    expect(households).toHaveLength(1);
    expect(households[0]!.key).toBe(plan.rows[1]!.householdKey);
  });

  it("keeps a household when at least one of its guests is still importing", () => {
    const plan = buildPlan(
      [
        ["The Boatengs", "Ama", "Boateng", ""],
        ["The Boatengs", "Kofi", "Boateng", ""],
      ],
      MAPPING,
      [],
      [],
    );

    const rows = plan.rows.map((row, i) => (i === 1 ? { ...row, action: "skip" as const } : row));
    expect(householdsToCreate(plan, rows)).toHaveLength(1);
  });
});
