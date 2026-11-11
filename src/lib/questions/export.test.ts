import { describe, expect, it } from "vitest";
import { answersCsv } from "./export";

describe("answersCsv", () => {
  it("puts guest and household answers on each guest's row", () => {
    const { header, rows } = answersCsv(
      [
        { id: "q1", label: "Need transport?", type: "boolean", scope: "guest" },
        { id: "q2", label: "Arriving by", type: "multi_select", scope: "household" },
      ],
      [
        { question_id: "q1", guest_id: "g1", household_id: null, value: "yes" },
        { question_id: "q1", guest_id: "g2", household_id: null, value: null },
        { question_id: "q2", guest_id: null, household_id: "h1", value: ["Bus", "Car"] },
      ],
      [
        { id: "g1", name: "Ana", household_id: "h1", household_name: "The Smiths" },
        { id: "g2", name: "Ben", household_id: "h1", household_name: "The Smiths" },
        { id: "g3", name: "Cal", household_id: "h2", household_name: "Cal" },
      ],
    );
    expect(header).toEqual(["Name", "Household", "Need transport?", "Arriving by"]);
    expect(rows).toEqual([
      ["Ana", "The Smiths", "Yes", "Bus; Car"],
      ["Ben", "The Smiths", "", "Bus; Car"],
      ["Cal", "Cal", "", ""],
    ]);
  });
});
