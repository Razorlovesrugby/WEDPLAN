#!/usr/bin/env node
/**
 * Creates the moodboards storage bucket. Idempotent — run it as often as you
 * like.
 *
 *   node scripts/ensure-bucket.mjs
 *
 * This is a script rather than a migration on purpose, and the reason is
 * worth knowing before anyone "tidies" it into supabase/migrations:
 * scripts/verify-migrations.sh applies every migration to a bare PostgreSQL
 * cluster with a hand-written shim that provides `auth` and nothing else.
 * Anything touching `storage` would fail there on every CI run, and the fix
 * would be teaching a test fixture to fake Supabase's storage schema — a
 * worse thing to own than this file.
 *
 * The bucket is PRIVATE and carries no policies. Every object in it is
 * written, signed and deleted by the service role, from code that has already
 * established which wedding the caller collaborates on. See
 * docs/specs/09-moodboards.md section 3.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Reads
 * .env.local if it is there, so it works straight after `supabase start`.
 */

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "moodboards";

// Matches ACCEPTED_IMAGE_TYPES in src/lib/moodboards.ts. A backstop to the
// client-side checks, not a replacement for them.
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 20 * 1024 * 1024;

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n" +
      "Locally: run `supabase start` and copy them into .env.local. See .env.example.",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existing, error: listError } = await supabase.storage.getBucket(BUCKET);

if (existing) {
  console.log(`==> bucket "${BUCKET}" already exists (public: ${existing.public})`);
  if (existing.public) {
    // Loud, because a public bucket silently undoes revocation: every image
    // stays fetchable by anyone who ever loaded it.
    console.error(
      `\n!! "${BUCKET}" is PUBLIC. It must be private — a public bucket hands out permanent\n` +
        "!! unauthenticated URLs, so revoking a share would close the page and leave every\n" +
        "!! image in it still reachable. Fix it in the Supabase dashboard.\n",
    );
    process.exit(1);
  }
  process.exit(0);
}

// getBucket errors for "not found" as well as for real problems; only the
// create call below can tell them apart.
if (listError) console.log(`==> no bucket yet (${listError.message})`);

const { error } = await supabase.storage.createBucket(BUCKET, {
  public: false,
  allowedMimeTypes: ALLOWED_MIME,
  fileSizeLimit: MAX_BYTES,
});

if (error) {
  console.error(`Could not create the bucket: ${error.message}`);
  process.exit(1);
}

console.log(`==> created private bucket "${BUCKET}"`);
