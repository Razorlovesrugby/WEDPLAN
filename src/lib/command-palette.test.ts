import { describe, expect, it } from "vitest";
import { goCommands, ilikePattern, makeCommands, matchScore, rankCommands, type Command } from "./command-palette";
import { navGroupsFor } from "./nav-groups";
import { isTypingTarget, shortcutFor, type KeyLike } from "./shortcuts";

describe("go to", () => {
  it.each(["couple", "planner"] as const)("offers every sidebar entry (%s)", (viewer) => {
    const hrefs = new Set(goCommands(viewer).map((command) => command.href));
    for (const entry of navGroupsFor(viewer).flatMap((group) => group.entries)) expect(hrefs).toContain(entry.href);
  });

  it("offers sub-views like Calendar and Save the date", () => {
    const labels = goCommands("couple").map((command) => command.label);
    expect(labels).toContain("Calendar");
    expect(labels).toContain("Save the date");
  });

  it("never offers a planner a couple-only screen", () => {
    const hrefs = goCommands("planner").map((command) => command.href ?? "");
    for (const blocked of ["/budget", "/gifts", "/site", "/settings", "/invitations", "/inbox", "/invitations/save-the-date"]) {
      expect(hrefs.some((href) => href === blocked || href.startsWith(`${blocked}#`))).toBe(false);
    }
  });

  it("finds Settings by what's in it", () => {
    const settings = goCommands("couple").find((command) => command.href === "/settings")!;
    expect(matchScore(settings, "timez")).toBeGreaterThan(0);
  });
});

describe("make", () => {
  const lists = [{ id: "l1", title: "Wedding to-dos" }];

  it("uses typed text for a task, a vendor and a moodboard", () => {
    const labels = makeCommands("couple", "Order the cake", lists).map((command) => command.label);
    expect(labels).toContain("Add “Order the cake” to Wedding to-dos");
    expect(labels).toContain("Add vendor “Order the cake”");
    expect(labels).toContain("New moodboard “Order the cake”");
  });

  it("offers every add form with nothing typed", () => {
    expect(makeCommands("couple", "", lists).map((command) => command.label)).toEqual([
      "New task",
      "New household",
      "New vendor",
      "New budget line",
      "New moodboard",
      "New event",
    ]);
  });

  it("gives a planner only what a planner can make", () => {
    expect(makeCommands("planner", "x", lists).map((command) => command.id)).toEqual([
      "make:task:l1",
      "make:vendor:named",
      "make:task",
      "make:vendor",
      "make:event",
    ]);
  });
});

describe("ranking", () => {
  const commands: Command[] = [
    { id: "a", group: "go", label: "Guest list", href: "/guests" },
    { id: "b", group: "go", label: "Budget", href: "/budget" },
    { id: "c", group: "find", label: "Smith family", hint: "Household", href: "/households/1" },
    { id: "d", group: "find", label: "Jo Smith", hint: "Guest", href: "/guests/2" },
    { id: "e", group: "make", label: "New budget line", href: "/budget", keywords: ["new"] },
  ];

  it("puts a label that starts with the query before one that contains it", () => {
    const find = rankCommands(commands, "smi").find((section) => section.group === "find")!;
    expect(find.commands.map((command) => command.id)).toEqual(["c", "d"]);
  });

  it("orders Go to, then Find, then Make", () => {
    expect(rankCommands(commands, "bud").map((section) => section.group)).toEqual(["go", "make"]);
  });

  it("shows no Find results until something is typed", () => {
    expect(rankCommands(commands, "").map((section) => section.group)).toEqual(["go", "make"]);
  });

  it("ignores case and accents", () => {
    expect(matchScore({ id: "x", group: "go", label: "Café booking" }, "CAFE")).toBe(3);
  });
});

describe("search text", () => {
  it("escapes wildcards and the characters that would break an or() filter", () => {
    expect(ilikePattern(" 100%_off, (sale) ")).toBe("%100\\%\\_off   sale%");
  });
});

describe("shortcuts", () => {
  const key = (partial: Partial<KeyLike>): KeyLike => ({ key: "", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...partial });

  it("⌘K and Ctrl+K open search, even while typing", () => {
    expect(shortcutFor(key({ key: "k", metaKey: true }), true)).toBe("palette");
    expect(shortcutFor(key({ key: "K", ctrlKey: true }), false)).toBe("palette");
  });

  it("⌘, opens Settings; ⌘⇧S toggles the sidebar", () => {
    expect(shortcutFor(key({ key: ",", metaKey: true }), false)).toBe("settings");
    expect(shortcutFor(key({ key: "S", metaKey: true, shiftKey: true }), false)).toBe("sidebar");
  });

  it("? opens the list, but never while typing", () => {
    expect(shortcutFor(key({ key: "?", shiftKey: true }), false)).toBe("help");
    expect(shortcutFor(key({ key: "?", shiftKey: true }), true)).toBeNull();
  });

  it("leaves ordinary keys alone", () => {
    expect(shortcutFor(key({ key: "k" }), false)).toBeNull();
    expect(shortcutFor(key({ key: "s", metaKey: true }), false)).toBeNull();
  });

  it("knows when focus is in a field", () => {
    expect(isTypingTarget({ tagName: "input" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
