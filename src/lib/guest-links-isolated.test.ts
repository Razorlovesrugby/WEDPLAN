import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The links guests already hold must not be touched by planner-side work
 * (spec 42 §6). Guests open these: their invitation page and save the date
 * (`/w`), the RSVP and invite links (`/rsvp`, `/i`), shared moodboards (`/m`),
 * the registry (`/registry`), the privacy notice, plus the root layout and
 * the middleware every request passes through.
 *
 * This walks every import from those entry points and fails if one reaches
 * a planner-only area. If it fails, the change has started sharing code with
 * a guest page: move the shared part somewhere neutral rather than widening
 * this list.
 */
const ROOT = process.cwd();
const SRC = join(ROOT, "src");

const PUBLIC_DIRS = ["src/app/w", "src/app/rsvp", "src/app/i", "src/app/m", "src/app/registry", "src/app/privacy"];
const PUBLIC_FILES = ["src/middleware.ts", "src/app/layout.tsx"];

const PLANNER_ONLY = [
  "src/app/(planner)/",
  "src/components/shell/",
  "src/components/design/",
  "src/components/invitations/",
  "src/lib/nav-groups.ts",
  "src/lib/nav-tabs.ts",
  "src/lib/invitations/",
  "src/server/queries/design.ts",
];

function files(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, encoding: "utf8" })
    .filter((name) => /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => join(dir, name));
}

const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const extension of EXTENSIONS) {
    const candidate = base + extension;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [join(ROOT, entry)];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?:import|export)[^"']*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
      const target = resolveImport(file, match[1] ?? match[2] ?? "");
      if (target) stack.push(target);
    }
  }
  return seen;
}

describe("guest links are out of reach of planner-only code", () => {
  const entries = [...PUBLIC_FILES, ...PUBLIC_DIRS.flatMap(files)];

  it("finds the guest-facing pages", () => {
    expect(entries.some((entry) => entry.includes("src/app/w/[slug]/[household]/page.tsx"))).toBe(true);
    expect(entries.some((entry) => entry.includes("save-the-date"))).toBe(true);
  });

  it.each(entries)("%s", (entry) => {
    const reached = [...reachable(entry)].map((file) => relative(ROOT, file));
    const leaks = reached.filter((file) => PLANNER_ONLY.some((prefix) => file.startsWith(prefix)));
    expect(leaks, `${entry} imports planner-only code`).toEqual([]);
  });
});
