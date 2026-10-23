import { describe, expect, it } from "vitest";
import { REGISTRY_CSV_HEADER, registryCsvRows } from "./export";

const base = { quantity: 1, message: null, arrived_at: null, thanked_at: null, released_at: null };
const fmt = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

describe("registryCsvRows", () => {
  it("has a column for every header", () => {
    const rows = registryCsvRows([{ ...base, name: "A", item_title: "Mixer", status: "claimed", created_at: "2026-01-02T00:00:00Z" }], fmt);
    expect(rows[0]).toHaveLength(REGISTRY_CSV_HEADER.length);
  });

  it("orders: needs a thank-you, then in progress, then thanked, then released", () => {
    const rows = registryCsvRows(
      [
        { ...base, name: "released", item_title: "x", status: "claimed", released_at: "2026-02-01T00:00:00Z", created_at: "2026-01-05T00:00:00Z" },
        { ...base, name: "thanked", item_title: "x", status: "thanked", created_at: "2026-01-04T00:00:00Z" },
        { ...base, name: "waiting", item_title: "x", status: "bought", created_at: "2026-01-03T00:00:00Z" },
        { ...base, name: "arrived", item_title: "x", status: "arrived", created_at: "2026-01-01T00:00:00Z" },
      ],
      fmt,
    );
    expect(rows.map((r) => r[0])).toEqual(["arrived", "waiting", "thanked", "released"]);
  });

  it("labels a released claim as Released whatever its stage was, and carries the message", () => {
    const [row] = registryCsvRows([{ ...base, name: "Jo", item_title: "Rug", message: "Love you!", status: "bought", released_at: "2026-02-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" }], fmt);
    expect(row![4]).toBe("Released");
    expect(row![3]).toBe("Love you!");
    expect(row![8]).toBe("2026-02-01");
  });
});
