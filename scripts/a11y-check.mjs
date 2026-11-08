#!/usr/bin/env node
/**
 * The accessibility check (spec 45). REPORT ONLY (Q2): it lists what axe-core
 * finds on each page and always exits 0, so it never blocks a build. Switch to
 * failing once the backlog is cleared.
 *
 *   A11Y_BASE_URL=http://localhost:3000 node scripts/a11y-check.mjs [/path ...]
 *
 * With no paths it checks the pages anyone can open. Planner pages need a
 * signed-in session: copy the cookie header from a browser into A11Y_COOKIE.
 * Each page is checked at iPad width (1024 × 768) and phone width (390).
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// Required, not imported, so a globally installed Playwright is found too.
const { chromium } = require("playwright");
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const base = (process.env.A11Y_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const paths = process.argv.slice(2);
const targets = paths.length > 0 ? paths : ["/login", "/forgot-password", "/start", "/privacy"];
const VIEWPORTS = [
  { name: "iPad", width: 1024, height: 768 },
  { name: "phone", width: 390, height: 844 },
];

const browser = await chromium.launch();
let serious = 0;
for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: true });
  if (process.env.A11Y_COOKIE) {
    const host = new URL(base).hostname;
    await context.addCookies(
      process.env.A11Y_COOKIE.split(/;\s*/).filter(Boolean).map((pair) => {
        const at = pair.indexOf("=");
        return { name: pair.slice(0, at), value: pair.slice(at + 1), domain: host, path: "/" };
      }),
    );
  }
  for (const path of targets) {
    const page = await context.newPage();
    try {
      await page.goto(base + path, { waitUntil: "networkidle", timeout: 60_000 });
      await page.addScriptTag({ content: axeSource });
      const results = await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        const run = await window.axe.run(document, { resultTypes: ["violations"] });
        return run.violations.map((violation) => ({ id: violation.id, impact: violation.impact, help: violation.help, count: violation.nodes.length }));
      });
      const bad = results.filter((result) => result.impact === "serious" || result.impact === "critical");
      serious += bad.length;
      console.log(`${viewport.name.padEnd(5)} ${path} — ${results.length === 0 ? "no problems" : `${results.length} kinds of problem`}`);
      for (const result of results) console.log(`        [${result.impact}] ${result.id}: ${result.help} (${result.count})`);
    } catch (error) {
      console.log(`${viewport.name.padEnd(5)} ${path} — could not check: ${error.message.split("\n")[0]}`);
    } finally {
      await page.close();
    }
  }
  await context.close();
}
await browser.close();
console.log(`\n${serious} serious or critical kinds of problem. Report only: this never fails the build.`);
