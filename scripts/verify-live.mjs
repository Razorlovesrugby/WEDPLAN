#!/usr/bin/env node
/**
 * Verify a REAL Supabase project.
 *
 *   node scripts/verify-live.mjs
 *
 * The other two verify scripts prove the migrations are correct. They prove it
 * against a throwaway cluster running a shim that fakes auth.users, auth.uid()
 * and the three roles — which is exactly where a policy that depends on real
 * Supabase Auth behaviour passes locally and fails live. This one asks the
 * live project instead.
 *
 * It checks three things, in the order they break:
 *
 *   1. The schema is there. Every table and view the app queries, checked by
 *      querying it — not by reading information_schema. That is deliberate:
 *      PostgREST exposes what it exposes, and a table that exists but is not
 *      visible through the API is just as broken from the app's point of view.
 *
 *   2. RLS actually denies the anon key. The migrations enable it and the SQL
 *      suite asserts the policies, but nothing has ever confirmed it holds in
 *      a project where anon is a real role with a real JWT. This is the check
 *      worth running: if it fails, the guest list is world-readable to anyone
 *      who has read the public anon key out of the page source.
 *
 *   3. The bootstrap ran. A wedding, its collaborators, events, questions and
 *      site content. Without these the app renders an empty dashboard or a
 *      redirect loop, and it looks like a code bug rather than a missing row.
 *
 * READ-ONLY. It writes nothing and deletes nothing, so it is safe against the
 * live project at any time, including after real guests have replied.
 *
 * Needs, in the environment or in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// --- environment ------------------------------------------------------------
// .env.local is read by hand rather than with a dotenv dependency: this script
// is run once or twice in the project's life, and it should not be the reason
// a package is installed.
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
    // No .env.local is fine — the variables may be exported already.
  }
}

loadEnvFile(new URL("../.env.local", import.meta.url).pathname);

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !ANON || !SERVICE) {
  console.error(
    "Missing environment. Needs NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY,\n" +
      "in the environment or in .env.local. See .env.example.",
  );
  process.exit(2);
}

// A service role key is a JWT whose role claim says so. Catching a swapped
// key here is much kinder than a hundred confusing permission errors.
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

/**
 * Every request gets a deadline.
 *
 * Without one, a typo in the project URL does not produce an error — it
 * produces a hang, because each of the twenty-odd checks waits out the
 * platform default in turn. A script that hangs is worse than one that fails:
 * you sit watching it instead of reading the reason.
 */
const REQUEST_TIMEOUT_MS = 10_000;

const timedFetch = (input, init = {}) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

const clientOptions = {
  auth: { persistSession: false },
  global: { fetch: timedFetch },
};

const admin = createClient(URL_, SERVICE, clientOptions);
const anon = createClient(URL_, ANON, clientOptions);

// Preflight, so an unreachable project is one clear message rather than
// twenty identical timeouts.
try {
  const response = await fetch(`${URL_.replace(/\/$/, "")}/rest/v1/`, {
    headers: { apikey: ANON },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status >= 500) {
    console.error(`${URL_} answered ${response.status}. Is the project paused?`);
    process.exit(2);
  }
} catch (error) {
  const reason = error?.name === "TimeoutError" ? "timed out" : (error?.message ?? String(error));
  console.error(
    `Could not reach ${URL_} — ${reason}.\n` +
      "Check NEXT_PUBLIC_SUPABASE_URL, and that the project is not paused.",
  );
  process.exit(2);
}

const TABLES = [
  "weddings",
  "collaborators",
  "events",
  "households",
  "guests",
  "tags",
  "guest_tags",
  "invitations",
  "invitation_events",
  "rsvps",
  "rsvp_questions",
  "rsvp_answers",
  "message_log",
  "site_content",
  "saved_views",
  "rsvp_token_attempts",
];

const VIEWS = ["v_households", "v_household_rsvp", "v_wedding_stats"];

let failures = 0;
let warnings = 0;

function pass(message) {
  console.log(`    ok  ${message}`);
}
function fail(message) {
  console.log(`    FAIL  ${message}`);
  failures++;
}
function warn(message) {
  console.log(`    warn  ${message}`);
  warnings++;
}

// --- 1. schema --------------------------------------------------------------
console.log(`==> ${URL_}`);
console.log("==> schema");

for (const relation of [...TABLES, ...VIEWS]) {
  const { error } = await admin.from(relation).select("*", { count: "exact", head: true });
  if (error) fail(`${relation} — ${error.message}`);
}
if (failures === 0) {
  pass(`all ${TABLES.length} tables and ${VIEWS.length} views are queryable`);
}

// --- 2. RLS against the anon key -------------------------------------------
// The anon key is public: it ships in the browser bundle. Everything below is
// what a stranger who read it out of the page source can reach.
console.log("==> row level security (as the anon key, which is public)");

const anonReadable = [];
for (const relation of [...TABLES, ...VIEWS]) {
  const { data, error } = await anon.from(relation).select("*").limit(1);
  // An error here is the good outcome for most tables: permission denied.
  if (!error && Array.isArray(data) && data.length > 0) anonReadable.push(relation);
}

if (anonReadable.length === 0) {
  pass("the anon key can read nothing without a session");
} else {
  // site_content is the one table a public site legitimately reads.
  for (const relation of anonReadable) {
    if (relation === "site_content") {
      warn(`${relation} is readable anonymously — expected, the public site reads it`);
    } else {
      fail(`${relation} IS READABLE BY ANYONE HOLDING THE ANON KEY`);
    }
  }
}

// --- 3. bootstrap -----------------------------------------------------------
console.log("==> bootstrap");

const { data: weddings, error: weddingError } = await admin
  .from("weddings")
  .select("id, name, wedding_date, timezone, capacity, rsvp_lock_at, cut_rank, tier_b_rank");

if (weddingError) {
  fail(`could not read weddings — ${weddingError.message}`);
} else if (weddings.length === 0) {
  fail("no wedding row — bootstrap.sql has not been run, so the app will render nothing");
} else {
  const wedding = weddings[0];
  pass(`wedding "${wedding.name}" (${weddings.length === 1 ? "one" : `${weddings.length} rows`})`);

  const { count: collaborators } = await admin
    .from("collaborators")
    .select("*", { count: "exact", head: true })
    .eq("wedding_id", wedding.id);
  if ((collaborators ?? 0) === 0) {
    fail("no collaborators — nobody can sign in and see this wedding");
  } else {
    pass(`${collaborators} collaborator${collaborators === 1 ? "" : "s"}`);
  }

  for (const [table, label] of [
    ["events", "event"],
    ["rsvp_questions", "RSVP question"],
    ["site_content", "site content block"],
  ]) {
    const { count } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("wedding_id", wedding.id);
    if ((count ?? 0) === 0) warn(`no ${label}s yet`);
    else pass(`${count} ${label}${count === 1 ? "" : "s"}`);
  }

  // Not failures — they are decisions, and the handoff lists them as open.
  if (!wedding.wedding_date) warn("wedding_date is not set");
  if (!wedding.capacity) warn("capacity is not set, so the cut line has nothing to measure against");
  if (!wedding.rsvp_lock_at) warn("rsvp_lock_at is not set, so RSVPs never close on their own");

  const { count: guests } = await admin
    .from("guests")
    .select("*", { count: "exact", head: true })
    .eq("wedding_id", wedding.id)
    .is("deleted_at", null);
  console.log(`    --  ${guests ?? 0} guests currently on the list`);
}

// --- verdict ----------------------------------------------------------------
console.log("");
if (failures > 0) {
  console.log(`FAIL — ${failures} problem${failures === 1 ? "" : "s"} above.`);
  process.exit(1);
}
console.log(
  warnings > 0
    ? `PASS with ${warnings} warning${warnings === 1 ? "" : "s"} — schema and RLS are sound.`
    : "PASS — schema, row level security and bootstrap all check out.",
);
