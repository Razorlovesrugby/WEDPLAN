#!/usr/bin/env node
/**
 * Load list_templates from supabase/templates/*.json into a real project.
 *
 *   node scripts/seed-templates.mjs
 *
 * list_templates is global reference data (no wedding_id), readable by every
 * authenticated collaborator and writable by nobody through the API (see
 * 0004_lists.sql) -- so the only way to populate or correct it is a script
 * running as the service role, which bypasses RLS by design. This is that
 * script.
 *
 * Ships three templates, matching spec 1 section 10's answer to "which seed
 * templates ship as starting points": decor, stationery, and the date-offset
 * timeline. The registry/gift-list template (US-shaped, doesn't map to a UK
 * wedding) and the photography shot list stay in checklists.json's `templates`
 * object -- kept for a possible future variant -- but are deliberately not
 * loaded here.
 *
 * Upserts on `key`, so re-running this after correcting a template's content,
 * or after 0005_lists_status_assignment.sql lands, is always safe.
 *
 * Needs, in the environment or in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// .env.local is read by hand rather than with a dotenv dependency -- same
// choice as scripts/verify-live.mjs, for the same reason: this runs once or
// twice in the project's life and should not be why a package is installed.
function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env.local is fine -- the variables may be exported already.
  }
}

loadEnvFile(new URL("../.env.local", import.meta.url).pathname);

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !SERVICE) {
  console.error(
    "Missing environment. Needs NEXT_PUBLIC_SUPABASE_URL and " +
      "SUPABASE_SERVICE_ROLE_KEY, in the environment or in .env.local. See .env.example.",
  );
  process.exit(2);
}

function roleOf(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString()).role;
  } catch {
    return null;
  }
}

if (roleOf(SERVICE) === "anon") {
  console.error("SUPABASE_SERVICE_ROLE_KEY looks like the anon key. Check which you pasted.");
  process.exit(2);
}

const REQUEST_TIMEOUT_MS = 10_000;
const timedFetch = (input, init = {}) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

const admin = createClient(URL_, SERVICE, {
  auth: { persistSession: false },
  global: { fetch: timedFetch },
});

function readTemplates(relativePath) {
  const path = new URL(`../supabase/templates/${relativePath}`, import.meta.url);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return parsed.templates;
}

/**
 * key -> { source file, sort_order }. kind and title are read out of the
 * template payload itself rather than repeated here, except kind falls back
 * to "checklist" for templates that don't carry one (checklists.json's
 * entries never have -- only the restructured timeline template does).
 */
const TO_LOAD = [
  { key: "decor", file: "checklists.json", sort_order: 1 },
  { key: "stationery", file: "checklists.json", sort_order: 2 },
  { key: "timeline", file: "task-timeline.json", sort_order: 3 },
];

async function main() {
  const cache = new Map();
  const rows = [];

  for (const { key, file, sort_order } of TO_LOAD) {
    if (!cache.has(file)) cache.set(file, readTemplates(file));
    const templates = cache.get(file);
    const template = templates[key];
    if (!template) {
      console.error(`"${key}" not found in supabase/templates/${file}`);
      process.exit(1);
    }
    rows.push({
      key,
      title: template.label,
      kind: template.kind ?? "checklist",
      sort_order,
      payload: template,
    });
  }

  console.log(`Upserting ${rows.length} template(s) into list_templates…`);
  const { data, error } = await admin
    .from("list_templates")
    .upsert(rows, { onConflict: "key" })
    .select("key, title, kind");

  if (error) {
    console.error("Upsert failed:", error.message);
    process.exit(1);
  }

  for (const row of data ?? []) {
    console.log(`  ok  ${row.key} — "${row.title}" (${row.kind})`);
  }
  console.log("Done.");
}

main();
